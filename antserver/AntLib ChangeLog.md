

## Changelog

Android ANT SDK Changelog
==========================================

<u>15 Apr 2016 - PC.3.5, Mac.3.5 (Changes since PC 3.2 and Mac 2.9.3.1 releases)</u>
-----------------------------------------
> Changes affecting all libraries
> -----------------------------------------------------
> * Change sdk version schema to "platform.major.minor"
> * Added decoding of Search Sharing Capability
> * Added set channel search priority and sharing cycles
> * Added get extended capabilities functionality
> * ANTFS Host added support to query state of last received ANTFS beacon
> * ANTFS Host added support configurable timeouts on various operations
> * [PC] Transitioned project files to vcxproj format
> 
> ANT Lib [ALU.3.8.0]
> -----------------------------------------------------
> * USB added fix for usb serial failures causing ANT sticks to stop communicating with specific combination of low-level USB commands introduced in Mac OSX 10.11 El Capitan (see https://www.thisisant.com/forum/viewthread/6359 for more info)
> * [Mac] Fix critical issues with transfer serialization and synchronization that could cause unexpected crashes and deadlocked transfers
> * Updated types and fixes for x64 compatibility and Mac compilers
> * Added missing encryption event defines
> * DSIANTDevice refactored to be more useful outside of ANTFS use case. Use this class to communicate with the adapter in a higher level of abstraction similar to the .Net Managed ANTLib AntDevice.
> * ANTFS client added support for uploads from host
> * ANTFS client enabled more logging when debug logging is on
> * ANTFS Host fixed an error in blackout list allowing blacked-out devices to still connect
> * ANTFSHost exposed host side device blackout list
> * ANTFSHost fixed thread hanging during shutdown in some cases
> * ANTFSHostChannel fixed ANT framer cancel flag left in TRUE state when closing after cancelling an ANTFS operation
> * Debug added printf logging function
> * Removed extraneous include references to ANTFS config.h
> * [Mac] Fix memory leaks occurring during init failures
> * [Mac] Add some missing ANT commands that already existed in PC release
> * [Mac] Fix some ACK packets showing as burst packets on some adapters that was already fixed in PC release
> * [Mac] Fixed issue with timer thread not closing responsively in some cases already fixed in PC release
> 
>
> ANT DLL [BFH.3.5.0]
> -----------------------------------------------------
> * Fix error with ANT_Init using default parameters in DLL
>
> ANT Managed Library [AMO.3.6.0]
> -----------------------------------------------------
> * ManagedLib ANTFS changed to decode friendly name as UTF8 instead of ASCII
> * Removed ANT_NET_Libraries.sln and added all .Net projects to ANT_Libraries.sln now that the free version of Visual Studio supports mixed project types.