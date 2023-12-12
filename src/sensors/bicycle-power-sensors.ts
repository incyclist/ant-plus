/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#521_tab
 * Spec sheet: https://www.thisisant.com/resources/bicycle-power/
 */

import { ChannelConfiguration, ISensor, Profile } from '../types';
import { Constants } from '../consts';
import { Messages } from '../messages';
import Sensor, { SensorState } from './base-sensor';



export class BicyclePowerSensorState extends SensorState{
	// Comon PWR
	Cadence?: number = undefined;
	CalculatedCadence?: number = undefined;
	Power?: number = undefined;
	CalculatedPower?: number = undefined;
	CalculatedTorque?: number = undefined;

	// 0x01 page
	Offset: number = 0;

	// 0x10 page
	_0x10_EventCount?: number = 0;
	_0x10_UpdateTime?: number = Date.now();
	PedalPower?: number = undefined;
	RightPedalPower?: number = undefined;
	LeftPedalPower?: number = undefined;
	AccumulatedPower?: number = 0;

	// 0x12 page
	_0x12_EventCount?: number = 0;
	_0x12_UpdateTime?: number = Date.now();
	CrankTicks?: number = 0;
	AccumulatedCrankPeriod?: number = 0;
	AccumulatedTorque?: number = 0;

	// 0x20 page
	_0x20_EventCount?: number = 0;
	_0x20_EventRepeat?: number = 0;
	Slope?: number = 0;
	TimeStamp?: number = 0;				// left for backward compatibility reasons
	CrankTicksStamp?: number = 0;
	TorqueTicksStamp?: number = 0;	
}

const DEVICE_TYPE 	= 0x0B
const PROFILE 		= 'PWR';
const PERIOD		= 8182


export default class BicyclePowerSensor extends Sensor implements ISensor {

	private states: { [id: number]: BicyclePowerSensorState } = {};

	getDeviceType(): number {
		return DEVICE_TYPE
	}
	getProfile(): Profile {
		return PROFILE
	}
	getDeviceID(): number {
		return this.deviceID
	}
	getChannelConfiguration(): ChannelConfiguration {
		return { type:'receive', transmissionType:0, timeout:Constants.TIMEOUT_NEVER, period:PERIOD, frequency:57}
	}

	onEvent(data: Buffer) {
		return
	}

	onMessage(data:Buffer) {
		const channel = this.getChannel()
		if (!channel)
			return;

		const channelNo = channel.getChannelNo()
		const deviceID = data.readUInt16LE(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 1);
		const deviceType = data.readUInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 3);

		if (data.readUInt8(Messages.BUFFER_INDEX_CHANNEL_NUM)!==channelNo || deviceType !== this.getDeviceType()) {
			return;
		}

		if (!this.states[deviceID]) {
			this.states[deviceID] = new BicyclePowerSensorState(deviceID);
			this.states[deviceID].Channel = this.channel.getChannelNo();
		}

		if (data.readUInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN) & 0x40) {
			if (data.readUInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 5) === 0x20) {
				this.states[deviceID].Rssi = data.readInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 6);
				this.states[deviceID].Threshold = data.readInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 7);
			}
		}

		switch (data.readUInt8(Messages.BUFFER_INDEX_MSG_TYPE)) {
			case Constants.MESSAGE_CHANNEL_BROADCAST_DATA:
			case Constants.MESSAGE_CHANNEL_ACKNOWLEDGED_DATA:
			case Constants.MESSAGE_CHANNEL_BURST_DATA:
				updateState(this.states[deviceID], data);
				if (this.deviceID===0 || this.deviceID===deviceID) {
					channel.onDeviceData(this.getProfile(), deviceID, this.states[deviceID] )
				} 

				break;
			default:
				break;
		}

	}
 

}


function updateState(state: BicyclePowerSensorState, data: Buffer) {
	state._RawData = data;
	const page = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA);
	switch (page) {
		case 0x01: { // calibration parameters
			const calID = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			if (calID === 0x10) {
				const calParam = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
				if (calParam === 0x01) {
					state.Offset = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
				}
			}
			break;
		}
		case 0x10: { // power only
			// According to the profile "Guidelines for Best Practice" section:
			/**
				Event-synchronous Updates
				Since no wheel (crank) events are occurring, no updates occur. The last page 
				is repeated until either a rotation event occurs or the unit shuts down. The 
				display should recognize that an extended period of repeated messages indicates 
				a stop or coasting. (For torque frequency sensors refer to section 13.7.)
				It is recommended that event-synchronous power sensors self-detect coasting or 
				stopped conditions and force an update to explicitly indicate this state to the
				display.

				Time-synchronous Updates
				If the wheel (or crank) is not moving in a system with fixed interval updates,
				the update count increases but the accumulated Wheel Ticks (crank ticks) and 
				Accumulated Wheel (Crank) Period do not increase. The display should interpret
				a zero increase in these values as a stop or coasting. For Power-only sensors 
				(i.e. sensors that only send data page 0x10) a stop or coasting condition is 
				indicated by the accumulated power remaining constant while the event updates 
				continue to increment.
				How and when the display handles these cases is up to the individual manufacturer.
			 */
			// Based on experimentation with a single-sided Stages power meter, when coasting it
			// will repeat the last broadcast without updates to the event count. That makes me
			// think that it is following the event-synchronous update method.
			//
			// This implementation relies on the accumulated power as recommended by the best
			// practice, with a varying threshold based on cadence (the lower the cadence, the
			// longer the delay is, to avoid zeroying the cadence when the crank is rotating
			// slowly)
			const oldUpdateTime = state._0x10_UpdateTime;
			const oldEventCount = state._0x10_EventCount;
			const oldAccumulatedPower = state.AccumulatedPower;
			const oldCadence = state.Cadence | 62.5; // if cadence is undefined, assume 62.5

			let delay = 125000 / oldCadence; // progressive delay, more sensitive at higher cadences
            const eventTime = Date.now();
			const eventCount = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			const accumulatedPower = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			if ((oldAccumulatedPower === accumulatedPower) && (eventTime - oldUpdateTime >= delay)) {
				// Detected coasting... 
				state.Cadence = state.Cadence === undefined ? undefined : 0;
				state.Power = 0;
			} 
			else if (oldEventCount !== eventCount) {
				// Update data
				state._0x10_UpdateTime = eventTime;
				state._0x10_EventCount = eventCount;
				state.AccumulatedPower = accumulatedPower;
				const pedalPower = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
				if (pedalPower !== 0xFF) {
					if (pedalPower & 0x80) {
						state.PedalPower = pedalPower & 0x7F;
						state.RightPedalPower = state.PedalPower;
						state.LeftPedalPower = 100 - state.RightPedalPower;
					} else {
						state.PedalPower = pedalPower & 0x7F;
						state.RightPedalPower = undefined;
						state.LeftPedalPower = undefined;
					}
				}
				let cadence = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
				state.Cadence = cadence === 0xFF ? undefined : cadence;
				state.Power = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
			}
			// else - I can't think of what could that be... do nothing
			break;
		}
		case 0x12: { // standard crankk torque
			// See 0x10.
			// Based on experimentation with a single-sided Stages power meter, when coasting it
			// will repeat the last broadcast without updates to the event count. 
			// For page 0x12, rely on event count to detect coasting.
			const oldUpdateTime = state._0x12_UpdateTime;
			const oldEventCount = state._0x12_EventCount;
			const oldCrankTicks = state.CrankTicks;
			const oldAccumulatedPeriod = state.AccumulatedCrankPeriod;
			const oldAccumulatedTorque = state.AccumulatedTorque;
			const oldCadence = state.Cadence | 62.5; // if cadence is undefined, assume 62.5

			let delay = 125000 / oldCadence; // progressive delay, more sensitive at higher cadences
            const eventTime = Date.now();
			let eventCount = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			if ((oldEventCount === eventCount) && (eventTime - oldUpdateTime >= delay)) {
				// Detected coasting... 
				state.Cadence = state.Cadence === undefined ? undefined : 0;
				state.CalculatedTorque = 0;
				state.CalculatedPower = 0;
				state.CalculatedCadence = 0;
			}
			else {
				state._0x12_UpdateTime = eventTime;
				state._0x12_EventCount = eventCount;
				if (oldEventCount > eventCount) {
					// Detected rollover
					eventCount += 256;
				}
				let crankTicks = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
				state.CrankTicks = crankTicks;
				if (oldCrankTicks > crankTicks) {
					// Detected rollover
					crankTicks += 256;
				}
				let cadence = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
				state.Cadence = cadence === 0xFF ? undefined : cadence;
				let accumulatedPeriod = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
				state.AccumulatedCrankPeriod = accumulatedPeriod
				if (oldAccumulatedPeriod > accumulatedPeriod) {
					// Detected rollover
					accumulatedPeriod += 65536;
				}
				let accumulatedTorque = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
				state.AccumulatedTorque = accumulatedTorque
				if (oldAccumulatedTorque > accumulatedTorque) {
					// Detected rollover
					accumulatedTorque += 65536;
				}

				// Calculating cadence and power
				const rotationEvents = eventCount - oldEventCount;
				const rotationPeriod = (accumulatedPeriod - oldAccumulatedPeriod) / 2048;
				const angularVel = 2 * Math.PI * rotationEvents / rotationPeriod;
				const torque = (accumulatedTorque - oldAccumulatedTorque) / (32 * rotationEvents);

				state.CalculatedTorque = torque;
				state.CalculatedPower = angularVel * torque;
				state.CalculatedCadence = 60 * rotationEvents / rotationPeriod;
			}
			break;
		}
		case 0x20: { // crank torque frequency
			// According to the profile documentation for crank torque frequency:
			/**
			    Cadence Time
				When the user stops pedaling, the update event count field in broadcast messages 
				does not increment. After receiving 12 messages with the same update event count 
				(approximately 3 seconds), the receiving device should change the cadence and power
				displays to zero.
			 */
			// Implement a way to count 12 repeating messages before detecting coasting.
			const oldEventCount = state._0x20_EventCount;
			const oldTimeStamp = state.TimeStamp;
			const oldTorqueTicksStamp = state.TorqueTicksStamp;

			let eventCount = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			const slope = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 3);
			let timeStamp = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 5);
			let torqueTicksStamp = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 7);

			if ((oldEventCount === eventCount) && (state._0x20_EventRepeat >= 12)) {
				// Detected coasting... 
				state.CalculatedTorque = 0;
				state.CalculatedPower = 0;
				state.CalculatedCadence = 0;
			} 
			else if (timeStamp !== oldTimeStamp && eventCount !== oldEventCount) {
				state._0x20_EventCount = eventCount;
				if (oldEventCount > eventCount) { //Hit rollover value
					eventCount += 255;
				}

				state.CrankTicksStamp = state.TimeStamp = timeStamp;

				if (oldTimeStamp > timeStamp) { //Hit rollover value
					timeStamp += 65400;
				}

				state.Slope = slope;
				state.TorqueTicksStamp = torqueTicksStamp;
				if (oldTorqueTicksStamp > torqueTicksStamp) { //Hit rollover value
					torqueTicksStamp += 65535;
				}

				const elapsedTime = (timeStamp - oldTimeStamp) * 0.0005;
				const torqueTicks = torqueTicksStamp - oldTorqueTicksStamp;

				const cadencePeriod = elapsedTime / (eventCount - oldEventCount); // s
				const cadence = Math.round(60 / cadencePeriod); // rpm
				state.CalculatedCadence = cadence;

				const torqueFrequency = (1 / (elapsedTime / torqueTicks)) - state.Offset; // Hz
				const torque = torqueFrequency / (slope / 10); // Nm
				state.CalculatedTorque = torque;

				state.CalculatedPower = torque * cadence * Math.PI / 30; // Watts
			}
			// else - I can't think of what could that be... do nothing
			break;
		}
        case 0x50: { // manufacturer's information
			// decode the Manufacturer ID
            state.ManId = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			// decode the 4 byte serial number
			state.SerialNumber = state.DeviceID;
			state.SerialNumber |= data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 2) << 16;
			state.SerialNumber >>>= 0;
            break;
		}
        case 0x51: { // product information
			// decode HW version, SW version, and model number
			state.HwVersion = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			state.SwVersion = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
			state.ModelNum = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			break;
        }
        case 0x52: { // battery status
			const batteryLevel = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			const batteryFrac = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
			const batteryStatus = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			if (batteryLevel !== 0xFF) {
				state.BatteryLevel = batteryLevel;
			}
			state.BatteryVoltage = (batteryStatus & 0x0F) + (batteryFrac / 256);
			const batteryFlags = (batteryStatus & 0x70) >>> 4;
			switch (batteryFlags) {
				case 1:
					state.BatteryStatus = 'New';
					break;
				case 2:
					state.BatteryStatus = 'Good';
					break;
				case 3:
					state.BatteryStatus = 'Ok';
					break;
				case 4:
					state.BatteryStatus = 'Low';
					break;
				case 5:
					state.BatteryStatus = 'Critical';
					break;
				default:
					state.BatteryVoltage = undefined;
					state.BatteryStatus = 'Invalid';
					break;
			}
			break;            
		}
		default:
			return;
	}	
}
