import { ChannelConfiguration, IChannel, ISensor, Profile } from '../types';

const SEND_TIMEOUT = 10000;

export abstract class SensorState {
    public constructor(deviceID: number) {
        this.DeviceID = deviceID;
    }

    DeviceID: number;
    
    // Common page - Manufacturer's Identification
    ManId?: number = undefined;
    SerialNumber?: number = undefined;

    // Common page - Product Information
    HwVersion?: number = undefined;
    SwVersion?: number = undefined;
    ModelNum?: number = undefined;

    // Common page - Battery status
    BatteryLevel?: number = undefined;
    BatteryVoltage?: number = undefined;
    BatteryStatus?: 'New' | 'Good' | 'Ok' | 'Low' | 'Critical' | 'Invalid' | 'Reserved (0)' | 'Reserved (6)'  = 'Invalid';

    // Debugging
    _RawData?: Buffer;
    Channel?: number;

    // Scanner
    Rssi?: number;
    Threshold?: number;
}

export default abstract class Sensor implements ISensor {
    protected deviceID: number;
    protected channel: IChannel;
    protected sendTimeout: number;    

    constructor(deviceID:number=0, channel?:IChannel) {
		this.deviceID = Number(deviceID)
        this.channel = channel
        this.sendTimeout = SEND_TIMEOUT

        // Bind 'this' to callbacks, so that it has the proper context
        // when called as a callback in the channel
        this.onMessage = this.onMessage.bind(this); 
        this.onEvent = this.onEvent.bind(this);
	}

    getChannel(): IChannel {
        return this.channel
    }
    setChannel(channel: IChannel): void {
        this.channel = channel
    }
    getDeviceID(): number {
        return this.deviceID
    }

    setSendTimeout( ms: number) {
        this.sendTimeout = ms;
    }
    getSendTimeout(): number {
        return this.sendTimeout;
    }

    abstract getProfile(): Profile;
    abstract getDeviceType(): number
    abstract getChannelConfiguration(): ChannelConfiguration;

    abstract onMessage(data: Buffer): void; 
    abstract onEvent(data: Buffer): void;
}
