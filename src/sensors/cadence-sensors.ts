/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#523_tab
 * Spec sheet: https://www.thisisant.com/resources/bicycle-speed-and-cadence/
 */

import { ChannelConfiguration, Profile } from '../types';
import { Messages } from '../messages';
import Sensor, { SensorState } from './base-sensor';
import { Constants } from '../consts';

export class CadenceSensorState extends SensorState {
    
    // Common to all pages
    CadenceEventTime: number;
    CumulativeCadenceRevolutionCount: number;

    // Data Page 0 - Default or Unknown Page
    _UpdateTime: number = Date.now();
    CalculatedCadence: number = 0;

    // Data Page 1 - Cumulative Operating Time
    OperatingTime?: number;

    // Data Page 5 - Motion and Cadence        
    Motion?: boolean = undefined;
}

const DEVICE_TYPE = 0x7a;
const PROFILE = 'CAD';
const PERIOD = 8102;
const TOGGLE_MASK = 0x80;

export default class CadenceSensor extends Sensor {
    private states: { [id: number]: CadenceSensorState } = {};

    getDeviceType(): number {
        return DEVICE_TYPE;
    }

    getProfile(): Profile {
        return PROFILE;
    }

    getChannelConfiguration(): ChannelConfiguration {
        return { type: 'receive', transmissionType: 0, timeout: Constants.TIMEOUT_NEVER, period: PERIOD, frequency: 57 };
    }

    onEvent(data: Buffer) {
        return;
    }

    onMessage(data: Buffer) {
        const channel = this.getChannel();
        if (!channel) return;

        const channelNo = channel.getChannelNo();
        const deviceID = data.readUInt16LE(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 1);
        const deviceType = data.readUInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 3);

        if (data.readUInt8(Messages.BUFFER_INDEX_CHANNEL_NUM) !== channelNo || deviceType !== this.getDeviceType()) {
            return;
        }

        if (!this.states[deviceID]) {
            this.states[deviceID] = new CadenceSensorState(deviceID);
            this.states[deviceID].Channel = channelNo
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
                if (this.deviceID === 0 || this.deviceID === deviceID) {
                    channel.onDeviceData(this.getProfile(), deviceID, this.states[deviceID]);
                }
                break;
            default:
                break;
        }
    }
}


function updateState(state: CadenceSensorState, data: Buffer) {
	state._RawData = data;
    const page = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA);
    switch (page & ~TOGGLE_MASK) { //check the new pages and remove the toggle bit
        case 1: { // cumulative operating time
            // Decode the cumulative operating time
            state.OperatingTime = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
            state.OperatingTime |= data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2) << 8;
            state.OperatingTime |= data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3) << 16;
            state.OperatingTime *= 2;
            break;
        }
        case 2: { // manufacturer id
            // Decode the Manufacturer ID
            state.ManId = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
            // Decode the 4 byte serial number
            state.SerialNumber = state.DeviceID;
            state.SerialNumber |= data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 2) << 16;
            state.SerialNumber >>>= 0;
            break;
        }
        case 3: { // product id
            // Decode HW version, SW version, and model number
            state.HwVersion = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
            state.SwVersion = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
            state.ModelNum = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
            break;
        }
        case 4: { // battery status
            const batteryFrac = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
            const batteryStatus = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
            state.BatteryVoltage = (batteryStatus & 0x0f) + batteryFrac / 256;
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
        case 5: { // motion and speed
            // NOTE: This code is untested
            state.Motion = (data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1) & 0x01) === 0x01;
            break; 
        }
        default: // default or unknown page (page 0)
            break;
    }
    // Outside of switch: handle common data to all pages
    // Older devices based on accelerometers that transmit page 0 instead of page 5 are
    // harder to work with - it is difficult to identify when the crank stopped rotating.
    // Stopped crank is detected by tracking the number of repeated events within a 
    // variable period of time
    const oldUpdateTime = state._UpdateTime;
    const oldCadenceTime = state.CadenceEventTime;
    const oldCadenceCount = state.CumulativeCadenceRevolutionCount;
    const oldCalculatedCadence = state.CalculatedCadence;

    let delay = 125000 / oldCalculatedCadence; // progressive delay, more sensitive at higher cadences
    const eventTime = Date.now();
    let cadenceTime = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
    const cadenceCount = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);

    if ((cadenceTime === oldCadenceTime) && (eventTime - oldUpdateTime >= delay)) {
        // Detected coasting...
        state.CalculatedCadence = 0;
    }
    else if (state.Motion !== undefined && !state.Motion) {
        // Motion exists and is false
        state.CalculatedCadence = 0;
    }
    else {
        // Calculate cadence
        state._UpdateTime = eventTime;
        state.CadenceEventTime = cadenceTime;
        state.CumulativeCadenceRevolutionCount = cadenceCount;
        if (oldCadenceTime > cadenceTime) {
            // Hit rollover value
            cadenceTime += 1024 * 64;
        }
        const cadence = (60 * (cadenceCount - oldCadenceCount) * 1024) / (cadenceTime - oldCadenceTime);
        if (!isNaN(cadence)) {
            state.CalculatedCadence = cadence;
        }
    }
}
