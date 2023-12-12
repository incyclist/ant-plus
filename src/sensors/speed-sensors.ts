/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#523_tab
 * Spec sheet: https://www.thisisant.com/resources/bicycle-speed-and-cadence/
 */

import { Constants } from '../consts';
import { Messages } from '../messages';
import { ISensor, Profile } from '../types';
import Sensor, { SensorState } from './base-sensor';

export class SpeedSensorState extends SensorState{
    // Common to all pages
    SpeedEventTime: number;
    CumulativeSpeedRevolutionCount: number;

    // Data Page 0 - Default or Unknown Page
    _UpdateTime: number 
    CalculatedDistance: number;
    CalculatedSpeed: number;

    // Data Page 1 - Cumulative Operating Time
    OperatingTime?: number;

    // Data Page 5 - Motion and Speed    
    Motion?: boolean;
}

const DEVICE_TYPE = 0x7b;
const PROFILE = 'SPD';
const PERIOD = 8118;

const DEFAULT_WHEEL_CIRCUMFERENCE = 2.118; // 700c wheel circumference in meters

export default class SpeedSensor extends Sensor implements ISensor {
    private states: { [id: number]: SpeedSensorState } = {};

    wheelCircumference: number = DEFAULT_WHEEL_CIRCUMFERENCE;

    getProfile(): Profile {
        return PROFILE;
    }

    getDeviceType(): number {
        return DEVICE_TYPE;
    }

    getChannelConfiguration() {
        return {
            type: 'receive',
            transmissionType: 0,
            timeout: Constants.TIMEOUT_NEVER,
            period: PERIOD,
            frequency: 57,
        };
    }

    onEvent(data: Buffer) {
        return;
    }

    setWheelCircumference(wheelCircumference: number) {
        this.wheelCircumference = wheelCircumference;
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
            this.states[deviceID] = new SpeedSensorState(deviceID);
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
                updateState(this, this.states[deviceID], data);
                if (this.deviceID === 0 || this.deviceID === deviceID) {
                    channel.onDeviceData(this.getProfile(), deviceID, this.states[deviceID]);
                }
                break;
            default:
                break;
        }
    }
}

const TOGGLE_MASK = 0x80;

function updateState(sensor: SpeedSensor, state: SpeedSensorState, data: Buffer) {
	state._RawData = data;
    const pageNum = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA);
    switch (pageNum & ~TOGGLE_MASK) { //check the new pages and remove the toggle bit
        case 1: { // cumulative operating time
            // Decode the cumulative operating time
            //decode the cumulative operating time
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
            break; // combining case 5 and case 1. If motion is 1 (stopped), break.
        }
        default: // default or unknown page (page 0)
            break;
    }
    // Outside of switch: handle common data to all pages
    // Older devices based on accelerometers that transmit page 0 instead of page 5 are
    // harder to work with - it is difficult to identify when the wheel stopped rotating.
    // Stopped wheel is detected by tracking the number of repeated events within a 
    // given period of time

    const oldUpdateTime = state._UpdateTime;
    const oldSpeedTime = state.SpeedEventTime;
    const oldSpeedCount = state.CumulativeSpeedRevolutionCount;

    let delay = 3000;
    const eventTime = Date.now();
    let speedTime = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
    const speedCount = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);

    if ((speedTime === oldSpeedTime) && (eventTime - oldUpdateTime >= delay)) {
        // Detected coasting...
        state.CalculatedSpeed = 0;
    }
    else if (state.Motion !== undefined && !state.Motion) {
        // Motion exists and is false
        state.CalculatedSpeed = 0;
    }
    else {
        // Calculate speed and distance
        state._UpdateTime = eventTime;
        state.SpeedEventTime = speedTime;
        state.CumulativeSpeedRevolutionCount = speedCount;
        if (oldSpeedTime > speedTime) {
            // Hit rollover value
            speedTime += 1024 * 64;
        }
        // Distance in meters
        const distance = sensor.wheelCircumference * (speedCount - oldSpeedCount);
        state.CalculatedDistance = distance;

        // Speed in meters/sec
        const speed = (distance * 1024) / (speedTime - oldSpeedTime);
        if (!isNaN(speed)) {
            state.CalculatedSpeed = speed;
        }
    }
}