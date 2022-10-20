_Note: Please check important notes at the bottom to avoid common errors using this sdk_

License and Copyright:
-------------------------

This software is subject to the license described in the License.txt file 
included with this software distribution. You may not use this file except in compliance 
with this license.

Copyright (c) Dynastream Innovations Inc. 2016
All rights reserved.


Project Hierarchy:
---------------------------


                                            ANT_LIB
                                               |
                                               |
                                               |
      -------------------------------------------------------------------------------------
      |                                        |                                           |
      |                                        |                                           |
      |                                        |                                           |
    ANT_DLL (C++)            -------------------------------------                 ANT_Unmanaged_Wrapper (C++)
      |                     |                  |                |                          |
      |         DEMO_HR_Transmitter (C++)  DEMO_LIB (C++)  DEMO_HR_RECEIVER (C++)          |
      |                                                                                    |
    DEMO_DLL (C++)                                                                ANT_Managed_Library (C#)
                                                                                           |
                                                                                           |
                                                                                   -------------------
                                                                                   |                 |                      
                                                                                   |                 |                       
                                                                               DEMO_NET (C#)   ANT_NetDll_Demo (C#)


The projects in this directory have been created designed and tested on Windows using the [Visual C++ and C# Compilers from Microsoft](https://www.visualstudio.com/en-us/products/vs-2015-product-editions.aspx).

The library files and demo programs (except those marked as C# projects) use generic C++ and should compile
with any standard C++ compiler, for example Borland Builder, GCC etc ...


---------------------------------------------------------------------------------

Description of projects:
=================

Visual Studio Solution: ANT_Libraries.sln (C++)
-----------------------------------------------------------
The Visual studio solution included in this package have been designed to handle all
the dependencies between projects.  Make sure to open the solution files instead of 
individual project files. Just open and build ANT_Libraries.sln.

ANT_LIB (C++)
-------------------
This is the main ANT library source code. It includes the low level serial
driver required to communicate with the USB stick as well as ANT message framing,
optional logging of serial messages exchanged between the PC and an ANT MCU, and 
ANT-FS client and host.  This library can be statically linked into custom
applications and provides greatest flexibility for custom implementations.

ANT_DLL (C++)
-------------------
Based on the ANT library (ANT_LIB), this project defines a windows dynamic library 
interface. The DLL may be imported into other languages that support dynamic libraries.
Use of the ANT DLL interface greatly simplifies PC application development with ANT.
Binary release versions of this DLL (ANT_DLL.dll) are available in the BIN directory,
along with all other necessary DLLs needed to run on a windows PC. 

DEMO_LIB (C++)
-------------------
A simple command line application built on top of the ANT library that demonstrates
how to setup ANT channels and data messages. 

DEMO_HR_RECEIVER (C++)
-------------------
A simple command line application built on top of the ANT library that demonstrates
how to setup ANT to simulate a heartrate monitor (HRM) reciever.

DEMO_HR_TRANSMITTER (C++)
-------------------
A simple command line application built on top of the ANT library that demonstrates
how to setup ANT channels and data messages to simulate a heartrate monitor (HRM) transmitter.

DEMO_DLL (C++)
-------------------
A simple command line application built on top of the ANT DLL that demonstrates how
to import the ANT DLL and setup ANT channels and data messages.

ANT_Unmanaged_Wrapper (C++)
-------------------
Based on the ANT library (ANT_LIB) this project is a wrapper around the ANT library
to expose the functionality of the library to the managed .NET environment. 
This project needs to be built separately, using the Visual C++ compiler.
Binary release versions of this wrapper (ANT_WrappedLib.dll) are available in the BIN
directory, along with all other necessary DLLs needed to run on a windows PC.

ANT_Managed_Library (C#)
-------------------
This project is the wrapper to be used in the .NET environment.  It exposes the
functionality of the unmanaged wrapper in a controlled class environment.
Binary release versions of this DLL (ANT_NET.dll) are available in the BIN
directory. 

DEMO_NET (C#)
-------------------
A simple command line application built on top of the ANT_NET DLL that demonstrates how
to import the managed library and setup ANT channels and data messages.

ANT_NetDLL_Demo (C#)
-------------------
A simple GUI application built on top of the ANT_NET DLL that illustrates the usage 
of the managed library in graphical applications using WPF.

---------------------------------------------------------------------------------

Important Notes to Avoid Common Errors:
==============================

__Important Note: Silabs Dynamic Libraries__

For ANT USB sticks that utilize the SiLabs CP210x USB/UART bridge it is necessary to include 
the Silabs DLLs in any projects that interface to a USB stick. The two DLLs
required are:

DSI_CP210xManufacturing_3_1.dll
DSI_SiUSBXp_3_1.dll

These are available in the BIN directory.
<br>
<br>
__Important Note: Using the ANT Managed Library__

The ANT Managed Library was designed for ease of integration of ANT in applications
using the .NET framework.  

When using the ANT Managed Library, BOTH the unmanaged and managed wrapper
need to be included.  The two DLLs required are:

ANT_WrappedLib.dll
ANT_NET.dll

The ANT_NET.dll needs to be included as a reference, while the ANT_WrappedLib.dll, along with
the Silabs Dynamic Libraries, just needs to be present in the working directory of your
application

Binary versions of these are available in the BIN directory.

Additionally, applications developed using the ANT Managed Library require the 
Microsoft .NET Framework v3.5 SP1.  If .NET Framework v4 is already installed, you may need to
install v3.5SP1 as well.
http://www.microsoft.com/downloads/details.aspx?FamilyId=333325FD-AE52-4E35-B531-508D977D32A6&displaylang=en

The ANT_WrappedLib.dll requires the Microsoft Visual C++ 2008 Redistributable Package
http://www.microsoft.com/downloads/en/details.aspx?familyid=9b2da534-3e03-4391-8a4d-074b9f2bc1bf&displaylang=en

<br>
<br>
__Important Note: Managed Applications for Windows 64-bit__

All the binary versions of the libraries included in the BIN directory, including
the Silabs Dynamic Libraries, are 32-bit DLL's.  In order for the application to run
on a 64-bit system, it is required to set the build configuration platform to x86,
to ensure that the application runs in 32-bit mode.

http://msdn.microsoft.com/en-us/library/ms973190.aspx

<br>
<br>
__Important Note: A note about LOG files.__

Log files are not generated by the ANT library and dynamic library by default. To enable
logging, the library must be compiled with the DEBUG_FILE define and subsequently
enabled using the DSIDebug::Init and DSIDebug::SetDebug function. 
In the projects included, this option is disabled by default.












