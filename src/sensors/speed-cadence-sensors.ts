/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#523_tab
 * Spec sheet: https://www.thisisant.com/resources/bicycle-speed-and-cadence/
 */

import { Constants } from '../consts';
import { Messages } from '../messages';
import { Profile } from '../types';
import Sensor, { SensorState } from './base-sensor';

export class SpeedCadenceSensorState extends SensorState{

    // Common to all pages
    CadenceEventTime: number;
    CumulativeCadenceRevolutionCount: number;
    SpeedEventTime: number;
    CumulativeSpeedRevolutionCount: number;

    // Data Page 0 - 
    _CadenceUpdateTime: number = Date.now();
    _SpeedUpdateTime: number = Date.now();
    CalculatedCadence: number;
    CalculatedDistance: number;
    CalculatedSpeed: number;
}

const DEVICE_TYPE = 0x79;
const PROFILE = 'SC';
const PERIOD = 8086;

const DEFAULT_WHEEL_CIRCUMFERENCE = 2.118; // 700c wheel circumference in meters

export default class SpeedCadenceSensor extends Sensor {
    private states: { [id: number]: SpeedCadenceSensorState } = {};

    wheelCircumference: number = DEFAULT_WHEEL_CIRCUMFERENCE;

    getDeviceType(): number {
        return DEVICE_TYPE;
    }

    getProfile(): Profile {
        return PROFILE;
    }

    getChannelConfiguration() {
        return { type: 'receive', transmissionType: 0, timeout: Constants.TIMEOUT_NEVER, period: PERIOD, frequency: 57 };
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
            this.states[deviceID] = new SpeedCadenceSensorState(deviceID);
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

function updateState(sensor: SpeedCadenceSensor, state: SpeedCadenceSensorState, data: Buffer) {
	state._RawData = data;
    // Page 0 is the only page defined for the combined speed / cadence sensor
    // Stopped wheel and crank are detected by tracking the number of repeated events within a 
    // given period of time

    const oldCadenceUpdateTime = state._CadenceUpdateTime;
    const oldSpeedUpdateTime = state._SpeedUpdateTime;
    const oldCadenceTime = state.CadenceEventTime;
    const oldCadenceCount = state.CumulativeCadenceRevolutionCount;
    const oldSpeedTime = state.SpeedEventTime;
    const oldSpeedCount = state.CumulativeSpeedRevolutionCount;
    const oldCalculatedCadence = state.CalculatedCadence;

    let cadenceDelay = 125000 / oldCalculatedCadence; // progressive delay, more sensitive at higher cadences
    let speedDelay = 3000;
    const updateTime = Date.now();
    let cadenceTime = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA);
    const cadenceCount = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 2);
    let speedTime = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
    const speedRevolutionCount = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);

    if ((cadenceTime === oldCadenceTime) && (updateTime - oldCadenceUpdateTime >= cadenceDelay)) {
        // Detected cadence coasting...
        state.CalculatedCadence = 0;
    }
    else if ((speedTime === oldSpeedTime) && (updateTime - oldSpeedUpdateTime >= speedDelay)) {
        // Detected wheel coasting...
        state.CalculatedSpeed = 0;
    }
    else {
        // Calculate cadence
        state._CadenceUpdateTime = updateTime;
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
        // Calculate distance and speed
        state._SpeedUpdateTime = updateTime;
        state.SpeedEventTime = speedTime;
        state.CumulativeSpeedRevolutionCount = speedRevolutionCount;
        if (oldSpeedTime > speedTime) {
            // Hit rollover value
            speedTime += 1024 * 64;
        }
        // Distance in meters
        const distance = sensor.wheelCircumference * (speedRevolutionCount - oldSpeedCount);
        state.CalculatedDistance = distance;
        // Speed in meters/sec
        const speed = (distance * 1024) / (speedTime - oldSpeedTime);
        if (!isNaN(speed)) {
            state.CalculatedSpeed = speed;
        }
    }
}