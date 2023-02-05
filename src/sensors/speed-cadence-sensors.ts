/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#523_tab
 * Spec sheet: https://www.thisisant.com/resources/bicycle-speed-and-cadence/
 */

import { Constants } from '../consts';
import { Messages } from '../messages';
import Sensor from './base-sensor';

export class SpeedCadenceSensorState {
    constructor(deviceID: number) {
        this.DeviceID = deviceID;
    }

    DeviceID: number;
    CadenceEventTime: number;
    CumulativeCadenceRevolutionCount: number;
    SpeedEventTime: number;
    CumulativeSpeedRevolutionCount: number;
    CalculatedCadence: number;
    CalculatedDistance: number;
    CalculatedSpeed: number;
    Rssi: number;
    Threshold: number;
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

    getProfile(): string {
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
    //get old state for calculating cumulative values
    const oldCadenceTime = state.CadenceEventTime;
    const oldCadenceCount = state.CumulativeCadenceRevolutionCount;
    const oldSpeedTime = state.SpeedEventTime;
    const oldSpeedCount = state.CumulativeSpeedRevolutionCount;

    let cadenceTime = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA);
    const cadenceCount = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 2);
    let speedEventTime = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
    const speedRevolutionCount = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);

    if (cadenceTime !== oldCadenceTime) {
        state.CadenceEventTime = cadenceTime;
        state.CumulativeCadenceRevolutionCount = cadenceCount;
        if (oldCadenceTime > cadenceTime) {
            //Hit rollover value
            cadenceTime += 1024 * 64;
        }

        const cadence = (60 * (cadenceCount - oldCadenceCount) * 1024) / (cadenceTime - oldCadenceTime);
        if (!isNaN(cadence)) {
            state.CalculatedCadence = cadence;
        }
    }

    if (speedEventTime !== oldSpeedTime) {
        state.SpeedEventTime = speedEventTime;
        state.CumulativeSpeedRevolutionCount = speedRevolutionCount;
        if (oldSpeedTime > speedEventTime) {
            //Hit rollover value
            speedEventTime += 1024 * 64;
        }

        const distance = sensor.wheelCircumference * (speedRevolutionCount - oldSpeedCount);
        state.CalculatedDistance = distance;

        //speed in m/sec
        const speed = (distance * 1024) / (speedEventTime - oldSpeedTime);
        if (!isNaN(speed)) {
            state.CalculatedSpeed = speed;
        }
    }
}
