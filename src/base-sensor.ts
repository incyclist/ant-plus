/*
import {BaseInterface, IDecodeDataCallback} from './types'
import Stick from './stick';
import { Constants } from './consts';
import { Messages } from './messages';
import EventEmitter from 'events';

export type MessageInfo = {
	msgId: number;
	channel: number;
	data?: Buffer;
	
	resolve,
	reject
}

export default class BaseInterfaceImpl extends EventEmitter implements BaseInterface  { 
	channel: number;
	deviceID: number;
	transmissionType: number;
	onReadHandler: (data:Buffer)=>void;
	isScanning: boolean;
	isScanControl: boolean;
	isSensor: boolean;
	messageQueue: MessageInfo[] = []
	isWriting: boolean;

	protected decodeDataCbk: IDecodeDataCallback;

	constructor(private stick: Stick) {
        super()
		
		this.onReadHandler = this.handleEventMessages.bind(this);
		this.isScanning = false;
		this.isScanControl = false;
		this.isSensor = false;
		this.isWriting = false;

		stick.on('read', this.onReadHandler);

	}

	async scan(type: string, frequency: number) {
		if (this.channel !== undefined) {
			throw 'already attached';
		}

		if (!this.stick.canScan) {
			throw 'stick cannot scan';
		}

		const channel = 0;

		if (this.stick.isScanning()) {
			this.channel = channel;
			this.deviceID = 0;
			this.transmissionType = 0;
			this.isScanControl = false;

			this.on('message',this.onData.bind(this))	
			process.nextTick(() => this.emit('attached'));
		} else {
			const canAttachForScan = this.stick.attach(this, true);
			if (!canAttachForScan)
				throw 'cannot attach';

			this.channel = channel;
			this.deviceID = 0;
			this.transmissionType = 0;
			this.isScanControl = true;
	
			await this.sendMessage(Messages.assignChannel(channel, type));
			await this.sendMessage(Messages.setDevice(channel, 0, 0, 0));
			await this.sendMessage(Messages.setFrequency(channel, frequency));
			await this.sendMessage(Messages.setRxExt());
			await this.sendMessage(Messages.libConfig(channel, 0xE0));
			await this.sendMessage(Messages.openRxScan());
			this.on('message',this.onData.bind(this))	
			process.nextTick(() => this.emit('attached'));
	
		}
	}

	async attach(channel: number, type: string, deviceID: number, deviceType: number, transmissionType: number,
		timeout: number, period: number, frequency: number) {

		if (this.stick.isScanning()) {			
			throw 'cannot attach';
		}

		if (this.channel !== undefined) {
			throw 'already attached';
		}
		if (!this.stick.attach(this, false)) {
			throw 'cannot attach';
		}
		this.channel = channel;
		this.deviceID = deviceID;
		this.transmissionType = transmissionType;
		this.isSensor = true;

		await this.sendMessage(Messages.assignChannel(channel, type));
		await this.sendMessage(Messages.setDevice(channel, deviceID, deviceType, transmissionType));
		await this.sendMessage(Messages.searchChannel(channel, timeout));
		await this.sendMessage(Messages.setFrequency(channel, frequency));
		await this.sendMessage(Messages.setPeriod(channel, period));
		await this.sendMessage(Messages.libConfig(channel, 0xE0));
		await this.sendMessage(Messages.openChannel(channel));
		this.on('message',this.onData.bind(this))	
		process.nextTick(() => this.emit('attached'));

	}

	onData( data:Buffer) {
        const msgId = data.readUInt8(Messages.BUFFER_INDEX_MSG_TYPE);

		if (data.length <= Messages.BUFFER_INDEX_EXT_MSG_BEGIN || !(data.readUInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN) & 0x80)) {
			switch (msgId) {
				case Constants.MESSAGE_CHANNEL_EVENT:
					this.emit('eventData', { message:data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA), 
											 code:data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA+1) });
					break;
				default:
					console.log('wrong message format', data.toString('hex'));
					break;
			}	
			return;
		}

		if (this.decodeDataCbk)
			this.decodeDataCbk(data)

	}
 	

	detach() {
		if (this.channel === undefined) {
			return;
		}
		const isScanning = this.stick.isScanning();


		if (isScanning && this.isScanControl ) {
			this.removeAllListeners('status')
			this.removeAllListeners('message')
	
			this.on('status', async (status)=> {
				if (status.msg===1 && status.code===Constants.EVENT_CHANNEL_CLOSED ) {
					await this.write(Messages.unassignChannel(this.channel));
					this.isScanControl = false;
					this.stick.stopScan()

					this.stick.removeAllListeners('read')
					this.emit('detached')
				}
			})
			this.sendMessage(Messages.closeChannel(this.channel));
	
		}
		else {		
			if (!isScanning) {
				if (!this.stick.detach(this)) {
					this.stick.removeListener('read',this.onReadHandler)
					this.isSensor = false;
					throw 'error detaching';
				}
			}
		}
	}

	stopScan() {
		this.removeAllListeners('message')
		this.removeAllListeners('status')
	}

	write(data: Buffer) {
		this.stick.write(data);
	}

	async sendMessage( data: Buffer, acknowledge:boolean=false) {
		const msgId = data.readUInt8(Messages.BUFFER_INDEX_MSG_TYPE)
		const channel = data.readUInt8(Messages.BUFFER_INDEX_CHANNEL_NUM);
		return new Promise( (resolve,reject) => {
			if ( (this.stick.isScanning() && this.isScanControl) || this.isSensor) {

				// TODO: check for special messages ( e.g. broadcast)
				if (this.isWriting) {
					this.messageQueue.push({msgId, channel, resolve,reject, data})
				}
				else {
					this.messageQueue.push({msgId, channel, resolve,reject})
					this.isWriting = true
					this.write(data)
				}
			}
		})		
	}


	handleEventMessages(data: Buffer) {
		const messageID = data.readUInt8(Messages.BUFFER_INDEX_MSG_TYPE);
		const channel = data.readUInt8(Messages.BUFFER_INDEX_CHANNEL_NUM);
		const prevMsgId =  this.messageQueue.length>0 ? this.messageQueue[0].msgId : undefined

		// TODO: check for special messages ( e.g. broadcast, acknowledge,...)
		// TODO: check for status responses for those messages

		if (messageID === Constants.MESSAGE_CHANNEL_EVENT && channel === this.channel) {
			const status = {
				msg: data.readUInt8(4),
				code: data.readUInt8(5),
			};

			this.emit('status', status);

			const resolve = (value)  => {
				if (this.messageQueue.length===0)
					return;
				const msg = this.messageQueue[0];
				this.messageQueue.splice(0,1)
				this.isWriting = false
				msg.resolve(status.code)			
			}

			const next = () => {
				if (this.messageQueue.length===0)
					return;
				const msg = this.messageQueue[0]
				this.isWriting = true;
				this.write(msg.data)
				msg.data = undefined
			}

			if ((this.stick.isScanning() && this.isScanControl) || this.isSensor) {
				if (status.msg!==1) {	// We have a response to the previous message
					if (prevMsgId===status.msg)
					{
						resolve(status.code)
						next()
						return
					}	
				}
				else {				// channel event, might relate to previous message
					if (status.code===5 || status.code===6) {
						resolve(status.code===5)
						next();
						return
					}

				}
	
			}
	
		}
		if (channel===this.channel)
			this.emit('message',data)
	}
}
*/