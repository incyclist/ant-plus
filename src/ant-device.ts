import EventEmitter from 'events';
import {usb,getDeviceList,Interface, InEndpoint,OutEndpoint,Device} from 'usb'
import { Constants } from './consts';
import { Messages } from './messages';
import { IAntDevice, AntDeviceProps, IChannel, AntOpenResult } from './types';
import Channel from './ant-channel';



const supportedDevices = [
	{vendor: 0x0fcf, product:0x1008,name:'GarminStick2'}, 
	{vendor: 0x0fcf, product:0x1009, name:'GarminStick3' }, 	
]


export class AntDevice implements IAntDevice {

	private device: Device;
	private iface: Interface;
	private detachedKernelDriver = false;
	private inEp: InEndpoint & EventEmitter;
	private outEp: OutEndpoint & EventEmitter;
	private leftover: Buffer;


	protected props: AntDeviceProps;
	protected maxChannels: number;
	protected canScan: boolean = false;
	protected waitingFor: { msgId?: number,event?:number, resolve }; 
	protected deviceNo;
	protected channels:  Channel[]

	protected static devices: { device:Device, inUse: boolean} []


	constructor(props?: AntDeviceProps) {
		this.props = props||{};

		this.maxChannels = undefined;
		this.channels = [];

		this.getDevices();
	}

	logEvent(event) {
		if (this.props && this.props.logger) {
			const logger = this.props.logger;

			if (logger.logEvent)
				logger.logEvent(event)
			else if (logger.log) {
				const str = Object.keys(event).map( k=>({key:k, data:event[k]}))
				.reduce( (p,d,i)=> i===0? `${d.key}:${d.data}`:`${p}, ${d.key}:${d.data}` , '')
				logger.log(str)
			}
		}		
	}

	getMaxChannels(): number {
		return this.maxChannels
	}

	isScanEnabled(): boolean {
		return this.canScan
	}
	getDeviceNumber(): number {
		return this.deviceNo
	}

	protected getDevices() {
		if (AntDevice.devices===undefined) {
			try {
				const allDevices = getDeviceList()
				if (!allDevices || allDevices.length===0) 
					return []

				const available = allDevices
				.filter((d) => {
					const {idVendor,idProduct} = d.deviceDescriptor;
					return supportedDevices.find( sd => sd.vendor===idVendor && sd.product===idProduct)!==undefined
				})
		
				AntDevice.devices =  available.map( device => ({device,inUse:false}))
				if (AntDevice.devices.length == 0) {
					AntDevice.devices = undefined
				}
				
			}
			catch {}
		}
		return AntDevice.devices;
	}

	protected markAsUsed(deviceNo:number) {
		AntDevice.devices[deviceNo].inUse = true;
	}
	protected releaseFromUsed(deviceNo:number) {
		AntDevice.devices[deviceNo].inUse = false;
	}


	async open(): Promise<boolean|AntOpenResult> {
		const available = this.getDevices();

		if (!available || available.length===0) 
			return this.props.detailedStartReport ? 'NoStick' : false
		
		let found = -1;
		const {deviceNo,startupTimeout} = this.props
		
		if (deviceNo!==undefined && deviceNo>=0) {
			if (available.length<=deviceNo || available[deviceNo].inUse)
				return this.props.detailedStartReport ? 'NoStick' : false

			const opened = await this.openUSBDevice( available[deviceNo].device );
			if (opened) 
				found = deviceNo

		}
		else {
			let i = 0;
			while (found===-1 && i<available.length) {
				const current = i;
				const deviceInfo = available[i++]
				if (!deviceInfo.inUse) {
					const opened = await this.openUSBDevice( deviceInfo.device );
					if (opened)
						found = current;
				}
			}
	
		}
		if (found!==-1) {

			const started = await this.startup(startupTimeout);
			if (!started) {
				await this.close();
				return this.props.detailedStartReport ? 'StartupError' : false

			}

			this.deviceNo = found;
			this.markAsUsed(found)
			
			this.channels = [];
			for (let i =0; i<this.maxChannels; i++) this.channels.push(null)
			return this.props.detailedStartReport ? 'Success' : true
		}
		
	}

	async close(): Promise<boolean> {

		for (let i=0; i<this.maxChannels;i++) {

			if (this.channels[i]!==null) 
				await this.channels[i].stopScanner()
			if (this.channels[i]!==null) 
				await this.channels[i].stopAllSensors()
			
		}

		const closed = await this.closeUSBDevice()
		if (!closed)
			return false;

		this.releaseFromUsed(this.deviceNo)
		this.deviceNo = undefined;
		this.maxChannels = undefined;

		// TODO: cleanup channels
		this.channels = [];

		AntDevice.devices = undefined;
		return true;
	}
	
	async openUSBDevice(device:usb.Device): Promise<boolean> {
		
		this.device = device;
		if (!this.device) 
			return false;

		try {
			this.device.open();

			this.iface = this.device.interfaces[0];
			try {
				if (this.iface.isKernelDriverActive()) {
					this.detachedKernelDriver = true;
					this.iface.detachKernelDriver();
				}
			} catch {
				// Ignore kernel driver errors;
			}
			this.iface.claim();
		} catch {
			// Ignore the error and try with the next device, if present
			this.device.close();
			this.device = undefined;
			this.iface = undefined;
			return false;
		}

		this.inEp = this.iface.endpoints[0] as InEndpoint;
		this.inEp.on('data', (data: Buffer) => {
			if (!data.length) {
				return;
			}

			if (this.leftover) {
				data = Buffer.concat([this.leftover, data]);
				this.leftover = undefined;
			}

			if (data.readUInt8(0) !== 0xA4) {
				this.onError('SYNC missing', data );
			}

			const len = data.length;
			let beginBlock = 0;
			while (beginBlock < len) {
				if (beginBlock + 1 === len) {
					this.leftover = data.slice(beginBlock);
					break;
				}
				const blockLen = data.readUInt8(beginBlock + 1);
				const endBlock = beginBlock + blockLen + 4;
				if (endBlock > len) {
					this.leftover = data.slice(beginBlock);
					break;
				}
				const readData = data.slice(beginBlock, endBlock);
				this.onMessage(readData);
				beginBlock = endBlock;
			}
		});

		this.inEp.on('error', (err: any) => {
			if (this.props.debug) {
				const logger = this.props.logger || console;
				logger.log('ERROR RECV: ', err);
			}
		});

		this.inEp.on('end', () => {
			if (this.props.debug) {
				const logger = this.props.logger || console;
				logger.log('STOP RECV: ');
			}
		});

		this.inEp.startPoll();

		this.outEp = this.iface.endpoints[1] as OutEndpoint;
		this.outEp.on('error', (err: any) => {
			if (this.props.debug) {
				const logger = this.props.logger || console;
				logger.log('ERROR OUTP: ', err);
			}
		});

		if (this.iface.endpoints.length>2) {
			this.iface.endpoints.forEach( ep => ep.on('error',()=>{
				//
			}))
		}

		return true
	}

	async startup(timeout?:number): Promise<boolean> {
		const sleep = (ms) => { return new Promise(resolve => setTimeout(resolve, ms))}

		return new Promise( async resolve => {
			let to: NodeJS.Timeout = undefined;

			if (timeout) {
				to = setTimeout( ()=>{
					resolve(false)
				}, timeout)
			}

			await this.sendMessage(Messages.resetSystem(), {msgId:Constants.MESSAGE_STARTUP});
			await sleep(1000);
			const data = await this.sendMessage(Messages.requestMessage(0, Constants.MESSAGE_CAPABILITIES), {msgId:Constants.MESSAGE_CAPABILITIES});
			this.maxChannels = data.readUInt8(3);
			this.canScan = (data.readUInt8(7) & 0x06) === 0x06;
			await this.sendMessage(Messages.setNetworkKey(),{event:Constants.MESSAGE_NETWORK_KEY});
			if (to) clearTimeout(to)
			resolve (true);
		})

	}

	async closeUSBDevice(): Promise<boolean> {

		if ( !this.device || !this.inEp)
			return true;

		return new Promise( resolve => {
			this.inEp.stopPoll(() => {
				// @ts-ignore
				this.iface.release(true, (error?:usb.LibUSBException) => {
					if (error) {
						return resolve(false)
					}

					if (this.detachedKernelDriver) {
						this.detachedKernelDriver = false;
						try {
							this.iface.attachKernelDriver();
						} catch  (err){
							// Ignore kernel driver errors;
							this.logEvent( {message:'error closing USBDevice',reason:err.message})
						}
					}
					this.iface = undefined;
					this.device.reset((error?:usb.LibUSBException) => {
						if (error) {
							return resolve(false)
						}

						this.device.close();
						resolve(true)

						this.device = undefined;
						this.inEp = undefined;
						this.outEp = undefined
					});
				});
			});
	
		})
	}

	getChannel(): IChannel {
		const freeChanneldIdx = this.channels.findIndex( c => c===null)
		if (freeChanneldIdx===-1)
			return null;
		const channel = new Channel(freeChanneldIdx,this)
		this.channels[freeChanneldIdx] = channel
		return channel;
	}

	freeChannel( channel: IChannel) {
		this.channels[channel.getChannelNo()] = null;

	}


	
	write(data: Buffer):void {
		if (!data)
			return;
			
		if (this.props.debug) {
			const logger = this.props.logger || console;
			this.logEvent({message:'ANT+ SEND', data:data.toString('hex')});
		}
		
		this.outEp.transfer(data, (error) => {
			if (error) 
				this.logEvent({message:'ANT+ SEND ERROR', data:data.toString('hex'), error});
		});
	}

	async sendMessage( data: Buffer,waitFor:{ msgId?:number, event?:number} ): Promise<Buffer> {
		return new Promise( (resolve) => {
			const {msgId,event} = waitFor
			this.waitingFor = { msgId,event, resolve}
			this.write(data)
		})		
	}



	onMessage(data: Buffer) {
		if (this.props.debug) {			
			this.logEvent({message:'ANT+ RECV', data:data.toString('hex')});
		}

		if (data.length<4 || data.readUInt8(0)!==Constants.MESSAGE_TX_SYNC) {
			this.logEvent({message:'ANT+ RECV ERROR', data:data.toString('hex'), error:'Illegal message'});
			return;
		}

		const msgLength = data.readUInt8(1);
		if (data.length<msgLength+3) {
			this.logEvent({message:'ANT+ RECV ERROR', data:data.toString('hex'), error:'Illegal message'});
			return;
		}
	

		// check for AntDevice initiated messages
		const messageID = data.readUInt8(2);
		if (this.waitingFor!==undefined && this.waitingFor.msgId) {
			if (messageID===this.waitingFor.msgId) {								
				this.waitingFor.resolve(data)
				this.waitingFor = undefined;
				return;
			}

		}
		else if (this.waitingFor!==undefined && this.waitingFor.event) {
			const event = data.readUInt8(4) 
			if (messageID===Constants.MESSAGE_CHANNEL_EVENT && event===this.waitingFor.event ) {								
				this.waitingFor.resolve(data)
				this.waitingFor = undefined;
				return;
			}

		}

		// no AntDevice initiated messages found, forward to channel
		this.channels.forEach( (channel,channelNo) => {
			if (!channel)
				return;
			const msgChannel = data.readUInt8( Messages.BUFFER_INDEX_CHANNEL_NUM)
			if (msgChannel===channelNo) {
				channel.onMessage(data)
			}
		})

	}

	onError( error: string, message:Buffer) {
		// TODO
		this.logEvent({message:'ANT+ ERROR', error, msg:message.toString('hex')})
	}
}