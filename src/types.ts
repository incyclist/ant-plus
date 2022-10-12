import EventEmitter from 'events';


export interface IDecodeDataCallback {
	(data: Buffer): void;
}

export interface BaseInterface   extends EventEmitter  {
    attach(channel: number, type: string, deviceID: number, deviceType: number, transmissionType: number,
		timeout: number, period: number, frequency: number) 
    detach()
    handleEventMessages(data: Buffer)
}

export interface BaseScanner extends BaseInterface {
    scan(type: string, frequency: number);
}

export interface BaseSensor extends BaseInterface {
    write(data: Buffer) 

}

export type AntDeviceProps = {
	deviceNo?: number;
	debug?: boolean;
	logger?: { logEvent?: (event)=>void, log:(...args)=>void};
	startupTimeout?: number;
}

export interface IAntDevice {
	//constructor(props?:AntDeviceProps)
	open(): Promise<boolean>
	close(): Promise<boolean>


	getMaxChannels(): number;

	getChannel(): IChannel;
	freeChannel( channel:IChannel)

	getDeviceNumber(): number;

	write(data:Buffer):void
	
}

export type ChannelProps = {
	debug?: boolean;
	logger?: { logEvent?: (event)=>void, log:(...args)=>void};
}

export interface IChannel {
	getChannelNo(): number;
	getDevice():IAntDevice;

	setProps(props:ChannelProps)
	getProps():ChannelProps

	onMessage(data:Buffer):void
	onDeviceData(profile: string, deviceID: number, deviceState: any)

	startScanner():Promise<boolean>
	stopScanner():Promise<boolean>
	attach(sensor: ISensor)

	startSensor(sensor:ISensor):Promise<boolean>
	stopSensor(sensor:ISensor):Promise<boolean>

	sendMessage(data:Buffer): Promise<any>
}

export type ChannelConfiguration  = {
	type: string,
	transmissionType: number, 
	timeout: number, 
	period: number, 
	frequency: number
}

export interface ISensor {
	getChannel(): IChannel
	setChannel(channel:IChannel): void 

	getDeviceType(): number;
	getProfile(): string;
	getDeviceID(): number;
	getChannelConfiguration(): ChannelConfiguration

	onMessage( data:Buffer)
	onEvent ( data:Buffer)
}


