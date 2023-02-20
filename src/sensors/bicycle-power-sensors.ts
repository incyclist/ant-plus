/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#521_tab
 * Spec sheet: https://www.thisisant.com/resources/bicycle-power/
 */

import { ChannelConfiguration, ISensor, Profile } from '../types';
import { Constants } from '../consts';
import { Messages } from '../messages';
import Sensor from './base-sensor';



export class BicyclePowerSensorState {
	constructor(deviceID: number) {
		this.DeviceID = deviceID;
	}

	DeviceID: number;
	PedalPower?: number;
	RightPedalPower?: number;
	LeftPedalPower?: number;
	Cadence?: number;
	AccumulatedPower?: number;
	Power?: number;
	offset: number = 0;
	EventCount?: number;
	TimeStamp?: number;
	Slope?: number;
	TorqueTicksStamp?: number;
	CalculatedCadence?: number;
	CalculatedTorque?: number;
	CalculatedPower?: number;
	Rssi?: number;
	Threshold?: number;

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
				updateState(this, this.states[deviceID], data);
				if (this.deviceID===0 || this.deviceID===deviceID) {
					channel.onDeviceData(this.getProfile(), deviceID, this.states[deviceID] )
				} 

				break;
			default:
				break;
		}

	}
 

}


function updateState(
	sensor: BicyclePowerSensor ,
	state: BicyclePowerSensorState,
	data: Buffer) {

	const page = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA);
	switch (page) {
		case 0x01: {
			const calID = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			if (calID === 0x10) {
				const calParam = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
				if (calParam === 0x01) {
					state.offset = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
				}
			}
			break;
		}
		case 0x10: {
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
			} else {
				state.PedalPower = undefined;
				state.RightPedalPower = undefined;
				state.LeftPedalPower = undefined;
			}
			const cadence = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			if (cadence !== 0xFF) {
				state.Cadence = cadence;
			} else {
				state.Cadence = undefined;
			}
			state.AccumulatedPower = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			state.Power = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
			break;
		}
		case 0x20: {
			const oldEventCount = state.EventCount;
			const oldTimeStamp = state.TimeStamp;
			const oldTorqueTicksStamp = state.TorqueTicksStamp;

			let eventCount = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			const slope = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 3);
			let timeStamp = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 5);
			let torqueTicksStamp = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 7);

			if (timeStamp !== oldTimeStamp && eventCount !== oldEventCount) {
				state.EventCount = eventCount;
				if (oldEventCount > eventCount) { //Hit rollover value
					eventCount += 255;
				}

				state.TimeStamp = timeStamp;
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

				const torqueFrequency = (1 / (elapsedTime / torqueTicks)) - state.offset; // Hz
				const torque = torqueFrequency / (slope / 10); // Nm
				state.CalculatedTorque = torque;

				state.CalculatedPower = torque * cadence * Math.PI / 30; // Watts
			}
			break;
		}
		default:
			return;
	}
	
}
