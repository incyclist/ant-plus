#ifndef SERVER_OUTPUT_HPP
#define SERVER_OUTPUT_HPP

#include <iomanip>
#include <iostream>
#include <mutex>
#include <sstream>
#include <string>

// Everything the ANT server tells its host application is written to stdout, one line per message.
//
// stdout is written from more than one thread: the thread that reads the requests from stdin
// (responses, debug echo) and the thread that receives from the USB stick (messages).
// A line must therefore be written in one piece, otherwise two lines get mixed up and the host
// sees truncated messages ("Illegal message").

inline std::mutex& serverOutputMutex()
{
   static std::mutex mutex;
   return mutex;
}

// Writes one complete line to stdout and flushes it
inline void serverWriteLine(const std::string& line)
{
   std::lock_guard<std::mutex> lock(serverOutputMutex());
   std::cout << line << "\n";
   std::cout.flush();
}

// Forwards a received ANT message to the host as "message/<hex>"
inline void serverWriteMessage(const unsigned char* data, size_t size)
{
   std::ostringstream line;
   line << "message/" << std::hex << std::setfill('0');
   for (size_t i = 0; i < size; ++i)
      line << std::setw(2) << static_cast<int>(data[i]);
   serverWriteLine(line.str());
}

#endif // SERVER_OUTPUT_HPP
