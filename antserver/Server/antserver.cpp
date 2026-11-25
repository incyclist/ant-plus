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
#include "server_output.hpp"

#include <stdio.h>
#include <assert.h>
#include <string.h>
#include <stdexcept>

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


// A message of the host is <message id> <data bytes> <checksum>. The framer builds the frame (sync, size, checksum) itself,
// so the data is at most MESG_MAX_SIZE_VALUE bytes and the checksum of the host is not used.
#define MESSAGE_MIN_BYTES     (3)                          // id, at least one data byte and checksum
#define MESSAGE_MAX_BYTES     (MESG_MAX_SIZE_VALUE + 2)    // id, data and checksum
#define MESSAGE_OVERHEAD      (2)                          // bytes that are not data: id and checksum

static int hexDigitValue(char c)
{
	if (c >= '0' && c <= '9') return c - '0';
	if (c >= 'a' && c <= 'f') return c - 'a' + 10;
	if (c >= 'A' && c <= 'F') return c - 'A' + 10;
	return -1;
}

// Decodes a string of hex digits. Fails if the length is odd, a character is not a hex digit or the
// result would be longer than maxBytes. The output is not touched in these cases.
static bool parseHex(const string& hex, size_t maxBytes, vector<UCHAR>& bytes)
{
	if (hex.length() % 2 != 0 || hex.length() / 2 > maxBytes)
		return false;

	vector<UCHAR> decoded;
	decoded.reserve(hex.length() / 2);
	for (size_t i = 0; i < hex.length(); i += 2) {
		const int high = hexDigitValue(hex[i]);
		const int low = hexDigitValue(hex[i + 1]);
		if (high < 0 || low < 0)
			return false;
		decoded.push_back(static_cast<UCHAR>(high * 16 + low));
	}
	bytes = decoded;
	return true;
}

// The device number is the number of the USB stick (0 for the first one): decimal digits only, 0 to 255
static bool parseDeviceNumber(const string& text, UCHAR& deviceNumber)
{
	if (text.empty() || text.length() > 3)
		return false;

	unsigned int value = 0;
	for (const char c : text) {
		if (c < '0' || c > '9')
			return false;
		value = value * 10 + static_cast<unsigned int>(c - '0');
	}
	if (value > 255)
		return false;

	deviceNumber = static_cast<UCHAR>(value);
	return true;
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
   // The server is deliberately not deleted: it lives until the process ends and the process exit
   // releases everything, there is nothing to gain from stopping the USB receive thread first.
   Server* pclDemo = new Server();
   pclDemo->WaitForInput();
   return 0; // NOSONAR
}

// The members of Server are initialized where they are declared, see antserver.h

////////////////////////////////////////////////////////////////////////////////
// ~Server
//
// Destructor, clean up and loose memory
//
////////////////////////////////////////////////////////////////////////////////
Server::~Server()
{
   ReleaseDevice();
}

////////////////////////////////////////////////////////////////////////////////
// ReleaseDevice
//
// The receive thread of the USB stick reports to the framer, so the thread has to
// be stopped before the framer is destroyed.
//
////////////////////////////////////////////////////////////////////////////////
void Server::ReleaseDevice()
{
   if(pclSerialObject)
      pclSerialObject->Close();

   pclMessageObject.reset();
   pclSerialObject.reset();
}

////////////////////////////////////////////////////////////////////////////////
// WaitForInput
//
// Waits for user input an processes the requests/messages
//
////////////////////////////////////////////////////////////////////////////////
// std::string_view (rule S6009) is not available: this project is built with the MSVC v140 toolset, which is before C++17
static vector<string> splitLine(const string& line) // NOSONAR
{
	vector<string> parts;
	size_t start = 0;
	size_t end = line.find('/');
	while (end != string::npos) {
		parts.push_back(line.substr(start, end - start));
		start = end + 1;
		end = line.find('/', start);
	}
	parts.push_back(line.substr(start));
	return parts;
}

// The host waits for the answer of every request, so every request that has an id is answered
void Server::HandleRequest(const vector<string>& res)
{
	if (res.size() < 2) {
		serverWriteLine("error/request/invalid_request");
		return;
	}

	const string& id = res[1];
	const string cmd = res.size() > 2 ? res[2] : "";

	if (cmd == "open") {
		UCHAR deviceNumber = 0;
		const bool valid = res.size() > 3 && parseDeviceNumber(res[3], deviceNumber);
		const BOOL opened = valid ? Init(deviceNumber, 0) : FALSE;
		serverWriteLine("response/" + id + "/" + (opened ? "true" : "false"));
	}
	else if (cmd == "close") {
		Close();
		serverWriteLine("response/" + id + "/");
	}
	else {
		serverWriteLine("response/" + id + "/false");
	}
}

void Server::HandleMessage(const vector<string>& res)
{
	if (!pclMessageObject) {
		serverWriteLine("error/channel_not_opened");
		return;
	}

	vector<UCHAR> bytes;
	if (res.size() < 2 || !parseHex(res[1], MESSAGE_MAX_BYTES, bytes) || bytes.size() < MESSAGE_MIN_BYTES) {
		serverWriteLine("error/message/invalid_message");
		return;
	}

	const auto dataSize = static_cast<USHORT>(bytes.size() - MESSAGE_OVERHEAD);
	auto message = ANT_MESSAGE{};
	message.ucMessageID = bytes[0];
	memcpy(message.aucData, &bytes[1], dataSize);
	pclMessageObject->WriteMessage(&message, dataSize);
}

void Server::WaitForInput() {

	for (string line; std::getline(std::cin, line);) {

		// echo of every request: the host uses the echo of its "ping/<ts>" requests to see that this server is alive
		serverWriteLine("debug/" + line);

		// a writer that ends its lines with CRLF must not turn every value into an invalid one
		if (!line.empty() && line.back() == '\r')
			line.pop_back();

		const vector<string> res = splitLine(line);

		try {
			if (res[0] == "request")
				HandleRequest(res);
			else if (res[0] == "message")
				HandleMessage(res);
		}
		catch (const std::logic_error&) { // what the string and vector operations above throw (out_of_range, length_error)
			// never stop serving because of a request that could not be handled; answer it if the host waits for it
			if (res[0] == "request" && res.size() > 1)
				serverWriteLine("response/" + res[1] + "/false");
			else if (res[0] == "request")
				serverWriteLine("error/request/invalid_request");
			else
				serverWriteLine("error/message/invalid_message");
		}
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
BOOL Server::Init(UCHAR ucDeviceNumber_, UCHAR /*ucChannelType_*/)
{

   BOOL bStatus;

   // A previous open (that was not closed, or whose open failed) must not leak its objects
   ReleaseDevice();

   // Initialize condition var and mutex
   UCHAR ucCondInit = DSIThread_CondInit(&condTestDone);
   assert(ucCondInit == DSI_THREAD_ENONE);

   UCHAR ucMutexInit = DSIThread_MutexInit(&mutexTestDone);
   assert(ucMutexInit == DSI_THREAD_ENONE);

   // Create Serial object.
   pclSerialObject = std::make_unique<DSISerialGeneric>();
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
   pclMessageObject = std::make_unique<DSIFramerANT>(pclSerialObject.get());
   assert(pclMessageObject);

   // Initialize Framer object.
   bStatus = pclMessageObject->Init();
   assert(bStatus);

   // Let Serial know about Framer.
   pclSerialObject->SetCallback(pclMessageObject.get());

   // Open Serial.
   bStatus = pclSerialObject->Open();

   // If the Open function failed, most likely the device
   // we are trying to access does not exist, or it is connected
   // to another program
   if(!bStatus)
   {
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

