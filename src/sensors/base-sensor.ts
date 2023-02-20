import { ChannelConfiguration, IChannel, ISensor, Profile } from '../types';

const SEND_TIMEOUT = 10000;

export default abstract class Sensor implements ISensor {
    protected deviceID: number;
    protected channel: IChannel;
    protected sendTimeout: number;

    constructor(deviceID:number=0, channel?:IChannel) {
		this.deviceID = Number(deviceID)
        this.channel = channel
        this.sendTimeout = SEND_TIMEOUT
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
