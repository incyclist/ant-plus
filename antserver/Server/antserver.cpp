/*
This software is subject to the license described in the License.txt file
included with this software distribution. You may not use this file except
in compliance with this license.

Copyright (c) Dynastream Innovations Inc. 2016
All rights reserved.
*/
#include "antserver.h"

#include "types.h"
#include "dsi_framer_ant.hpp"
#include "dsi_thread.h"
#include "dsi_serial_generic.hpp"
#include "dsi_debug.hpp"

#include <stdio.h>
#include <assert.h>

#include <string>
#include <iostream>
#include <vector>
#include <sstream>
#include <iomanip>

using std::istringstream;
using std::string;
using std::vector;
using std::cout;

#define ENABLE_EXTENDED_MESSAGES

#define USER_BAUDRATE         (50000)  // For AT3/AP2, use 57600
#define USER_RADIOFREQ        (35)

#define USER_ANTCHANNEL       (0)
#define USER_DEVICENUM        (49)
#define USER_DEVICETYPE       (1)
#define USER_TRANSTYPE        (1)

#define USER_NETWORK_KEY      {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,}
#define USER_NETWORK_NUM      (0)      // The network key is assigned to this network number

#define MESSAGE_TIMEOUT       (1000)

// Indexes into message recieved from ANT
#define MESSAGE_BUFFER_DATA1_INDEX ((UCHAR) 0)
#define MESSAGE_BUFFER_DATA2_INDEX ((UCHAR) 1)
#define MESSAGE_BUFFER_DATA3_INDEX ((UCHAR) 2)
#define MESSAGE_BUFFER_DATA4_INDEX ((UCHAR) 3)
#define MESSAGE_BUFFER_DATA5_INDEX ((UCHAR) 4)
#define MESSAGE_BUFFER_DATA6_INDEX ((UCHAR) 5)
#define MESSAGE_BUFFER_DATA7_INDEX ((UCHAR) 6)
#define MESSAGE_BUFFER_DATA8_INDEX ((UCHAR) 7)
#define MESSAGE_BUFFER_DATA9_INDEX ((UCHAR) 8)
#define MESSAGE_BUFFER_DATA10_INDEX ((UCHAR) 9)
#define MESSAGE_BUFFER_DATA11_INDEX ((UCHAR) 10)
#define MESSAGE_BUFFER_DATA12_INDEX ((UCHAR) 11)
#define MESSAGE_BUFFER_DATA13_INDEX ((UCHAR) 12)
#define MESSAGE_BUFFER_DATA14_INDEX ((UCHAR) 13)


void readHex(char* buf, const char* txt) {
	char b[3] = "00";
	for (unsigned int i = 0; i < strlen(txt); i += 2) {
		b[0] = *(txt + i);
		b[1] = *(txt + i + 1);
		*(buf + (i >> 1)) = strtoul(b, NULL, 16);
	}
}



////////////////////////////////////////////////////////////////////////////////
// main
//
// Usage:
//
// c:\DEMO_LIB.exe [device_no] [channel_type]
//
// ... where
//
// device_no:     USB Device port, starting at 0
// channel_type:  Master = 0, Slave = 1
//
// ... example
//
// c:\Demo_LIB.exe 0 0
//
// Comment to USB port 0 and open a Master channel
//
// If optional arguements are not supplied, user will
// be prompted to enter these after the program starts.
//
////////////////////////////////////////////////////////////////////////////////
int main(int argc, char **argv)
{
   Server* pclDemo = new Server();
   pclDemo->WaitForInput();
   return 0;
}

////////////////////////////////////////////////////////////////////////////////
// Server
//
// Constructor, intializes Demo class
//
////////////////////////////////////////////////////////////////////////////////
Server::Server()
{
   ucChannelType = CHANNEL_TYPE_INVALID;
   pclSerialObject = (DSISerialGeneric*)NULL;
   pclMessageObject = (DSIFramerANT*)NULL;
   uiDSIThread = (DSI_THREAD_ID)NULL;
   bMyDone = FALSE;
   bDone = FALSE;
   bDisplay = TRUE;
   bBroadcasting = FALSE;

   memset(aucTransmitBuffer,0,ANT_STANDARD_DATA_PAYLOAD_SIZE);
}

////////////////////////////////////////////////////////////////////////////////
// ~Server
//
// Destructor, clean up and loose memory
//
////////////////////////////////////////////////////////////////////////////////
Server::~Server()
{
   if(pclMessageObject)
      delete pclMessageObject;

   if(pclSerialObject)
      delete pclSerialObject;
}

////////////////////////////////////////////////////////////////////////////////
// WaitForInput
//
// Waits for user input an processes the requests/messages
//
////////////////////////////////////////////////////////////////////////////////
void Server::WaitForInput() {

	for (string line; std::getline(std::cin, line);) {

		vector<string> res;
		string delimiter = "/";

		cout << "debug/" << line << "\n";
		
		size_t pos_start = 0, pos_end, delim_len = delimiter.length();
		std::string token;

		while ((pos_end = line.find(delimiter, pos_start)) != string::npos) {
			token = line.substr(pos_start, pos_end - pos_start);
			pos_start = pos_end + delim_len;
			res.push_back(token);
		}
		res.push_back(line.substr(pos_start));


		try {
			if (res[0] == "request") {
				string id = res[1];
				string cmd = res[2];

				if (cmd == "open") {

					BOOL opened = Init(stoi(res[3]), 0);
					std::cout << "response/" << id << "/" << (opened? "true": "false") << "\n";
				}
				else if (cmd == "close") {

					Close();					
					std::cout << "response/" << id << "/" << "\n";
				}
				//printf("response/%s/%s\n", id, "true");
				//}

			}
			else if (res[0] == "message") {
				if (pclMessageObject == NULL) {
					cout << "error/channel_not_opened\n";
				}
				else {
					const string data = res[1];

					size_t len = data.length();
					char buffer[MESG_BUFFER_SIZE];
					readHex(&buffer[0], data.c_str());

					pclMessageObject->WriteMessage(buffer, len / 2);
				}
			}

		}
		catch(...) {}


		
	}
}


////////////////////////////////////////////////////////////////////////////////
// Init
//
// Initize the Demo and ANT Library.
//
// ucDeviceNumber_: USB Device Number (0 for first USB stick plugged and so on)
//                  If not specified on command line, 0xFF is passed in as invalid.
// ucChannelType_:  ANT Channel Type. 0 = Master, 1 = Slave
//                  If not specified, 2 is passed in as invalid.
//
////////////////////////////////////////////////////////////////////////////////
BOOL Server::Init(UCHAR ucDeviceNumber_, UCHAR ucChannelType_)
{

   BOOL bStatus;

   // Initialize condition var and mutex
   UCHAR ucCondInit = DSIThread_CondInit(&condTestDone);
   assert(ucCondInit == DSI_THREAD_ENONE);

   UCHAR ucMutexInit = DSIThread_MutexInit(&mutexTestDone);
   assert(ucMutexInit == DSI_THREAD_ENONE);

   // Create Serial object.
   pclSerialObject = new DSISerialGeneric();
   assert(pclSerialObject);


   // Initialize Serial object.
   // The device number depends on how many USB sticks have been
   // plugged into the PC. The first USB stick plugged will be 0
   // the next 1 and so on.
   //
   // The Baud Rate depends on the ANT solution being used. AP1
   // is 50000, all others are 57600
   bStatus = pclSerialObject->Init(USER_BAUDRATE, ucDeviceNumber_);
   assert(bStatus);

   // Create Framer object.
   pclMessageObject = new DSIFramerANT(pclSerialObject);
   assert(pclMessageObject);

   // Initialize Framer object.
   bStatus = pclMessageObject->Init();
   assert(bStatus);

   // Let Serial know about Framer.
   pclSerialObject->SetCallback(pclMessageObject);

   // Open Serial.
   bStatus = pclSerialObject->Open();

   // If the Open function failed, most likely the device
   // we are trying to access does not exist, or it is connected
   // to another program
   if(!bStatus)
   {
      //printf("Failed to connect to device at USB port %d\n", ucDeviceNumber_);
      return FALSE;
   }

   return TRUE;
}


////////////////////////////////////////////////////////////////////////////////
// Close
//
// Close connection to USB stick.
//
////////////////////////////////////////////////////////////////////////////////
void Server::Close()
{

   //Close all stuff
   if(pclSerialObject)
      pclSerialObject->Close();

}

