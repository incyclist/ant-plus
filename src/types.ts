import EventEmitter from 'events';

export interface IDecodeDataCallback {
	(data: Buffer): void;
}

export interface BaseInterface   extends EventEmitter  {
    attach(channel: number, type: string, deviceID: number, deviceType: number, transmissionType: number,
		timeout: number, period: number, frequency: number): void;
    detach(): void;
    handleEventMessages(data: Buffer): void;
}

export interface BaseScanner extends BaseInterface {
    scan(type: string, frequency: number): void;
}

export interface BaseSensor extends BaseInterface {
    write(data: Buffer): void;
}

export type AntDeviceProps = {
	deviceNo?: number;
	debug?: boolean;
	logger?: { logEvent?: (event)=>void, log:(...args)=>void};
	startupTimeout?: number;
	detailedStartReport?:boolean;
}

export type AntOpenResult = 'Success' |  'AlreadyInUse' | 'NoStick' | 'CommunicationError' | 'StartupError'

export interface IAntDevice {
	open(): Promise<boolean|AntOpenResult>
	close(): Promise<boolean>

	getMaxChannels(): number;

	getChannel(): IChannel;
	freeChannel( channel:IChannel): void

	getDeviceNumber(): number;

	write(data:Buffer):void
}

export type ChannelProps = {
	debug?: boolean;
	logger?: { logEvent?: (event)=>void, log:(...args)=>void};
}

export type Profile = 'PWR'| 'HR'| 'FE'| 'CAD'| 'SPD'| 'SC'; 

export interface IChannel {
	getChannelNo(): number;
	getDevice():IAntDevice;

	setProps(props:ChannelProps): void;
	getProps():ChannelProps

	onMessage(data:Buffer):void
	onDeviceData(profile: Profile, deviceID: number, deviceState: any): void;

	startScanner():Promise<boolean>
	stopScanner():Promise<boolean>
	attach(sensor: ISensor): void;

	startSensor(sensor:ISensor):Promise<boolean>
	stopSensor(sensor:ISensor):Promise<boolean>

	sendMessage(data:Buffer, props?:{ timeout?:number}): Promise<any>
	flush(): void
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
	getProfile(): Profile;
	getDeviceID(): number;
	getChannelConfiguration(): ChannelConfiguration

	onMessage(data:Buffer): void;
	onEvent(data:Buffer): void;
}

