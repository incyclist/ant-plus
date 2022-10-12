import { IChannel, ISensor } from '../types';

export default abstract class Sensor implements ISensor {
    protected deviceID: number;
    protected channel: IChannel;

    constructor(deviceID:number=0, channel?:IChannel) {
		this.deviceID = Number(deviceID)
        this.channel = channel
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

    abstract getProfile(): string ;
    abstract getDeviceType(): number
    abstract getChannelConfiguration();

    abstract onMessage(data: Buffer); 
    abstract onEvent( data: Buffer);

}