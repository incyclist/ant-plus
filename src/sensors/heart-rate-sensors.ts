/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#526_tab
 * Spec sheet: https://www.thisisant.com/resources/heart-rate-monitor/
 */

import { ChannelConfiguration, ISensor, Profile } from '../types';
import { Constants } from '../consts';
import { Messages } from '../messages';
import Sensor, { SensorState } from './base-sensor';

export class HeartRateSensorState extends SensorState{
	// Common to all pages
	BeatTime: number;
	BeatCount: number;
	ComputedHeartRate: number;

	// Data Page 1 - Cumulative Operating Time
	OperatingTime?: number;

	// Data Page 4 - Measured Time 
	PreviousBeat?: number;

	// Data Page 5 - ???
	IntervalAverage?: number;
	IntervalMax?: number;
	SessionAverage?: number;

	// Data Page 6 - ???
	SupportedFeatures?: number;
	EnabledFeatures?: number;
}

const DEVICE_TYPE 	= 120;
const PROFILE 		= 'HR';
const PERIOD		= 8070

export default class HeartRateSensor extends Sensor implements ISensor {

	protected states: { [id: number]: HeartRateSensorState } = {};
	protected pages: { [id: number]: Page } = {};


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

	onMessage(data: Buffer) {
		
		const channel = this.getChannel()
		if (!channel)
			return;
		const channelNo = channel.getChannelNo()

		if (data.readUInt8(Messages.BUFFER_INDEX_CHANNEL_NUM) !== channelNo) {
			return;
		}

		const deviceID = data.readUInt16LE(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 1);
		const deviceType = data.readUInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 3);
		if (deviceType !== this.getDeviceType()) {
			return;
		}

		if (!this.states[deviceID]) {
			this.states[deviceID] = new HeartRateSensorState(deviceID);
			this.states[deviceID].Channel = channelNo
		}

		if (!this.pages[deviceID]) {
			this.pages[deviceID] = { oldPage: -1, pageState: PageState.INIT_PAGE };
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
				updateState(this.states[deviceID], this.pages[deviceID], data);

				if (this.deviceID===0 || this.deviceID===deviceID) {
					channel.onDeviceData(this.getProfile(), deviceID, this.states[deviceID] )
				} 

				break;
			default:
				break;
		}
		
	}

}


const TOGGLE_MASK = 0x80;
enum PageState { INIT_PAGE, STD_PAGE, EXT_PAGE }

type Page = {
	oldPage: number;
	pageState: PageState // sets the state of the receiver - INIT, STD_PAGE, EXT_PAGE
};

function updateState(
	state: HeartRateSensorState,
	page: Page,
	data: Buffer) {

	const pageNum = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA);
	if (page.pageState === PageState.INIT_PAGE) {
		page.pageState = PageState.STD_PAGE; // change the state to STD_PAGE and allow the checking of old and new pages
		// decode with pages if the page byte or toggle bit has changed
	} else if ((pageNum !== page.oldPage) || (page.pageState === PageState.EXT_PAGE)) {
		page.pageState = PageState.EXT_PAGE; // set the state to use the extended page format
		switch (pageNum & ~TOGGLE_MASK) { //check the new pages and remove the toggle bit
			case 1:
				//decode the cumulative operating time
				state.OperatingTime = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
				state.OperatingTime |= data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2) << 8;
				state.OperatingTime |= data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3) << 16;
				state.OperatingTime *= 2;
				break;
			case 2:
				//decode the Manufacturer ID
				state.ManId = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
				//decode the 4 byte serial number
				state.SerialNumber = state.DeviceID;
				state.SerialNumber |= data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 2) << 16;
				state.SerialNumber >>>= 0;
				break;
			case 3:
				//decode HW version, SW version, and model number
				state.HwVersion = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
				state.SwVersion = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
				state.ModelNum = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
				break;
			case 4:
				//decode the previous heart beat measurement time
				state.PreviousBeat = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 2);
				break;
			case 5:
				state.IntervalAverage = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
				state.IntervalMax = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
				state.SessionAverage = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
				break;
			case 6:
				state.SupportedFeatures = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
				state.EnabledFeatures = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
				break;
			case 7: {
				const batteryLevel = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
				const batteryFrac = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
				const batteryStatus = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
				if (batteryLevel !== 0xFF) {
					state.BatteryLevel = batteryLevel;
				}
				const coarseBatteryVoltage = batteryStatus & 0x0F				
				if ( coarseBatteryVoltage!==0x0F)  {
					state.BatteryVoltage = coarseBatteryVoltage + (batteryFrac / 256);
				}

				const batteryFlags = (batteryStatus & 0x70) >>> 4;
				switch (batteryFlags & 0x07) {
					case 0:
						state.BatteryStatus = `Reserved (0)`
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
					case 6:
						state.BatteryStatus = `Reserved (6)`
					default:
						state.BatteryStatus = `Invalid`
						break;
				}
				break;
			}
			default:
				break;
		}
	}
	// decode the last four bytes of the HRM format, the first byte of this message is the channel number
	DecodeDefaultHRM(state, data.slice(Messages.BUFFER_INDEX_MSG_DATA + 4));
	page.oldPage = pageNum;
}

function DecodeDefaultHRM(state: HeartRateSensorState , pucPayload: Buffer) {
	// decode the measurement time data (two bytes)
	state.BeatTime = pucPayload.readUInt16LE(0);
	// decode the measurement count data
	state.BeatCount = pucPayload.readUInt8(2);
	// decode the measurement count data
	state.ComputedHeartRate = pucPayload.readUInt8(3);
}
