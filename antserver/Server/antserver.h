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

#include <memory>

#define CHANNEL_TYPE_MASTER   (0)
#define CHANNEL_TYPE_SLAVE    (1)
#define CHANNEL_TYPE_INVALID  (2)



class Server {
public:
   Server() = default;
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


   // Stops the receive thread of the USB stick and then destroys the framer and the serial object
   void ReleaseDevice();

   BOOL bBursting = FALSE; //holds whether the bursting phase of the test has started
   BOOL bBroadcasting = FALSE;
   BOOL bMyDone = FALSE;
   BOOL bDone = FALSE;
   UCHAR ucChannelType = CHANNEL_TYPE_INVALID;
   std::unique_ptr<DSISerialGeneric> pclSerialObject;
   std::unique_ptr<DSIFramerANT> pclMessageObject;
   DSI_THREAD_ID uiDSIThread{};
   DSI_CONDITION_VAR condTestDone{};
   DSI_MUTEX mutexTestDone{};

   BOOL bDisplay = TRUE;

   UCHAR aucTransmitBuffer[ANT_STANDARD_DATA_PAYLOAD_SIZE] = {};


// UCHAR pucData[USER_DATA_LENGTH];  //data to transfer in a burst




};

#endif //TEST_H
