# incyclist-ant-plus

Module to interface ANT+ Sensors/Devices, developed and maintained for [Incyclist](https://incyclist.com) Indoor Cycling App


## Prerequisites

Libusb is included as a submodule. On Linux, you'll need libudev to build libusb. On Ubuntu/Debian: `sudo apt-get install build-essential libudev-dev`

### Windows

__Using the AntDevice binding__

Use [Zadig](http://sourceforge.net/projects/libwdi/files/zadig/) to install the WinUSB driver for your USB device. Otherwise you will get `LIBUSB_ERROR_NOT_SUPPORTED` when attempting to open devices.

__Using the AntServerBinding binding__

The `antserver.exe` needs to be deployed together with your app. You can find a pre-compiled version in the [./bin](./bin) directory, or you can compile it yourself based on the sources provided in the  [./antserver](./antserver) directory


## Install

```sh
npm install incyclist-ant-plus
```

## Usage

#### __Create and connect to USB Device (stick)__

```javascript
const {AntDevice} = require('incyclist-ant-plus/lib/bindings')

const ant = new AntDevice({startupTimeout:2000})
const success = await ant.open()
```

The library will automatically detect the matching Stick type ( Garmin2 / Garmin3)

#### __Reserve the next available channel__

```javascript
const channel = ant.getChannel();
```

#### __Use channel to scan for Sensors__

```javascript
const {BicyclePowerSensor,FitnessEquipmentSensor,HeartRateSensor} = require('incyclist-ant-plus');

//channel.on('detect', (profile, id) => console.log('detected',profile,id))

//channel.on('data', (profile, id, data) => console.log('data',profile,id, data))

channel.attach(new BicyclePowerSensor())
channel.attach(new HeartRateSensor())
channel.attach(new FitnessEquipmentSensor())

const detected = await channel.startScanner({timeout:10000})
console.log(detected)
```

#### __Stop ongoing scan__

might be used when scan should be stopped as soon as first/specific device is detected

has to be called explicitly if scan is done without timeout

```javascript
channel.stopScanner()
``` 


#### __Use channel to connect to a specific Sensor__

```javascript
const {FitnessEquipmentSensor} = require('incyclist-ant-plus');

channel.on('data', (profile, id, data) => console.log('data',profile,id, data))

const sensor = new FitnessEquipmentSensor()
const success = await channel.startSensor(sensor)
console.log(detected)

if (success) {
	console.log( "set User Weight = 78kg, Bike Weight= 10kg" );
	await sensor.sendUserConfiguration(78,10);
	
	console.log( "set slope to 1.1%" );
	await sensor.sendTrackResistance(1.1);
}
```


## Important notes

* In order to avoid problems at next launch, always call ant.close() at the end of the program

## Writing your customized Classes

The library was designed so that the implemention of the interfaces can be customized

As Incyclist is developed as React app running in Electron, it will require a special implementions of the IAntDevice interface
- IpcAntDevice: to be used in the renderer process to communicate with the AntDevice class in the Electron main process
- WinAntDevice: A special implementation using ANT.DLL, to remove the dependency to [Zadig](http://sourceforge.net/projects/libwdi/files/zadig/) 



## Classes

### AntDevice (IAntDevice)

#### Constructor

```typescript
constructor( props?: {
	deviceNo?: number;
	startupTimeout?: number;
	detailedStartReport?:boolean
	debug?: boolean;
	logger?: { logEvent?: (event)=>void, log:(...args)=>void};
})
```

_deviceNo_: In case you have multiple sticks connected, identifies the stick number. (0=first,1=second,...). Adding/removing a stick will not be recognized during the session ( i.e. after first use of constructor)

_startupTimeout_: timeout (in ms) after which the startup attempt should be stopped. If no timeout is given, the `open()`call will be blocking.

_detailedStartReport_: if set to true, the open() method will provide more detailed result (AntOpenResult type), otherwise it will return a boolean

_debug_: enables debug mode ( message logging)

_logger_: logger to be use for debug logging


#### Methods

__open__
```typescript
open():Promise<boolean|AntOpenResult>
```

Tries to open the stick. 
In case the property _detailedStartReport_ has been set, it will return any of 'Success', 'NoStick', 'StartupError'
Returns `true` on success and `false` on failure.

__close__
```typescript
close():Promise<boolean>
```

Tries to close the stick and all opened channels.
Returns `true` on success and `false` on failure.


__getMaxChannels__

```typescript
getMaxChannels():number
```

returns the maximum number of channels that this stick supports; valid only after stick was opened successfully.

__getDeviceNumber__

```typescript
getDeviceNumber():number
```

returns the current device(stick) number (0=first,1=second,...); valid only after stick was opened successfully.

__getChannel__
```typescript
getChannel():IChannel
```

Tries to reserve the next available channel - up to the maximum number of channels as indicated by `getMaxChannels()`

Returns a Channel object on success and `null` on failure.

__freeChannel__
```typescript
closeChannel(IChannel):void
```

removes the reservation for a channel.<br>
**Note** This should never be called directly. It will be called by the methods of `stopScanner()` and `stopSensor()`

__write__
```typescript
write(data:Buffer):void
```

sends a message to the ANT+Device


### Channel (IChannel)

_TODO_

### Sensor

_TODO_


### Available Sensors

_TODO_
