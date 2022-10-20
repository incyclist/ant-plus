/*
This software is subject to the license described in the License.txt file
included with this software distribution. You may not use this file except
in compliance with this license.

Copyright (c) Dynastream Innovations Inc. 2016
All rights reserved.
*/
#ifndef _VERSION_H_
#define _VERSION_H_

#include "build_version.h"

#define VER_FILE_DESCRIPTION_STR    PRODUCT_STRING
#define VER_FILE_VERSION            VERSION_MAJOR, VERSION_MINOR, VERSION_MICRO, VERSION_STEPS
#define VER_FILE_VERSION_STR        VERSION_MAJOR     \
                                    "." VERSION_MINOR \
                                    "." VERSION_MICRO \
                                    "." VERSION_STEPS

#define VER_PRODUCTNAME_STR         PRODUCT_STRING
#define VER_PRODUCT_VERSION         VER_FILE_VERSION
#define VER_PRODUCT_VERSION_STR     VER_FILE_VERSION_STR

#if LIBRARY_EXPORTS
  #define VER_ORIGINAL_FILENAME_STR VER_PRODUCTNAME_STR ".dll"
#else
  #define VER_ORIGINAL_FILENAME_STR VER_PRODUCTNAME_STR ".exe"
#endif
#define VER_INTERNAL_NAME_STR       VER_ORIGINAL_FILENAME_STR

#define VER_COPYRIGHT_STR           "Dynastream Innovations Inc. (C) 2015"

#ifdef _DEBUG
  #define VER_VER_DEBUG             VS_FF_DEBUG
#else
  #define VER_VER_DEBUG             0
#endif

#define VER_FILEOS                  VOS_NT_WINDOWS32
#define VER_FILEFLAGS               VER_VER_DEBUG

#if LIBRARY_EXPORTS
  #define VER_FILETYPE              VFT_DLL
#else
  #define VER_FILETYPE              VFT_APP
#endif

#endif //ifndef _VERSION_H_
