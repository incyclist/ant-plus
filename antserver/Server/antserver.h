/*
This software is subject to the license described in the License.txt file
included with this software distribution. You may not use this file except
in compliance with this license.

Copyright (c) Dynastream Innovations Inc. 2016
All rights reserved.
*/
#ifndef _DEMO_H_
#define _DEMO_H_

#include "types.h"
#include "dsi_framer_ant.hpp"
#include "dsi_thread.h"
#include "dsi_serial_generic.hpp"

#define CHANNEL_TYPE_MASTER   (0)
#define CHANNEL_TYPE_SLAVE    (1)
#define CHANNEL_TYPE_INVALID  (2)



class Server {
public:
   Server();
   virtual ~Server();
   BOOL Init(UCHAR ucDeviceNumber_, UCHAR ucChannelType_);
   void Close();
   //Listens for a response from the module
   void WaitForInput();

private:

   //Starts the Message thread.
   static DSI_THREAD_RETURN RunMessageThread(void *pvParameter_);

   //Decodes the received message
   void ProcessMessage(ANT_MESSAGE stMessage, USHORT usSize_);


   BOOL bBursting; //holds whether the bursting phase of the test has started
   BOOL bBroadcasting;
   BOOL bMyDone;
   BOOL bDone;
   UCHAR ucChannelType;
   DSISerialGeneric* pclSerialObject;
   DSIFramerANT* pclMessageObject;
   DSI_THREAD_ID uiDSIThread;
   DSI_CONDITION_VAR condTestDone;
   DSI_MUTEX mutexTestDone;

   BOOL bDisplay;

   UCHAR aucTransmitBuffer[ANT_STANDARD_DATA_PAYLOAD_SIZE];


// UCHAR pucData[USER_DATA_LENGTH];  //data to transfer in a burst




};

#endif //TEST_H
