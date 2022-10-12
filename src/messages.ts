import { Constants } from './consts';

export class Messages {
	static BUFFER_INDEX_MSG_LEN: number = 1;
	static BUFFER_INDEX_MSG_TYPE: number = 2;
	static BUFFER_INDEX_CHANNEL_NUM: number = 3;
	static BUFFER_INDEX_MSG_DATA: number = 4;
	static BUFFER_INDEX_EXT_MSG_BEGIN: number = 12;

	static resetSystem(): Buffer {
		const payload: number[] = [];
		payload.push(0x00);
		return this.buildMessage(payload, Constants.MESSAGE_SYSTEM_RESET);
	}

	static requestMessage(channel: number, messageID: number): Buffer {
		let payload: number[] = [];
		payload = payload.concat(this.intToLEHexArray(channel));
		payload.push(messageID);
		return this.buildMessage(payload, Constants.MESSAGE_CHANNEL_REQUEST);
	}

	static setNetworkKey(): Buffer {
		const payload: number[] = [];
		payload.push(Constants.DEFAULT_NETWORK_NUMBER);
		payload.push(0xB9);
		payload.push(0xA5);
		payload.push(0x21);
		payload.push(0xFB);
		payload.push(0xBD);
		payload.push(0x72);
		payload.push(0xC3);
		payload.push(0x45);
		return this.buildMessage(payload, Constants.MESSAGE_NETWORK_KEY);
	}

	static assignChannel(channel: number, type = 'receive'): Buffer {
		let payload: number[] = [];
		payload = payload.concat(this.intToLEHexArray(channel));
		if (type === 'receive') {
			payload.push(Constants.CHANNEL_TYPE_TWOWAY_RECEIVE);
		} else if (type === 'receive_only') {
			payload.push(Constants.CHANNEL_TYPE_ONEWAY_RECEIVE);
		} else if (type === 'receive_shared') {
			payload.push(Constants.CHANNEL_TYPE_SHARED_RECEIVE);
		} else if (type === 'transmit') {
			payload.push(Constants.CHANNEL_TYPE_TWOWAY_TRANSMIT);
		} else if (type === 'transmit_only') {
			payload.push(Constants.CHANNEL_TYPE_ONEWAY_TRANSMIT);
		} else if (type === 'transmit_shared') {
			payload.push(Constants.CHANNEL_TYPE_SHARED_TRANSMIT);
		} else {
			throw 'type not allowed';
		}
		payload.push(Constants.DEFAULT_NETWORK_NUMBER);
		return this.buildMessage(payload, Constants.MESSAGE_CHANNEL_ASSIGN);
	}

	static setDevice(channel: number, deviceID: number, deviceType: number, transmissionType: number): Buffer {
		let payload: number[] = [];
		payload = payload.concat(this.intToLEHexArray(channel));
		payload = payload.concat(this.intToLEHexArray(deviceID, 2));
		payload = payload.concat(this.intToLEHexArray(deviceType));
		payload = payload.concat(this.intToLEHexArray(transmissionType));
		return this.buildMessage(payload, Constants.MESSAGE_CHANNEL_ID);
	}

	static searchChannel(channel: number, timeout: number): Buffer {
		let payload: number[] = [];
		payload = payload.concat(this.intToLEHexArray(channel));
		payload = payload.concat(this.intToLEHexArray(timeout));
		return this.buildMessage(payload, Constants.MESSAGE_CHANNEL_SEARCH_TIMEOUT);
	}

	static setPeriod(channel: number, period: number): Buffer {
		let payload: number[] = [];
		payload = payload.concat(this.intToLEHexArray(channel));
		payload = payload.concat(this.intToLEHexArray(period));
		return this.buildMessage(payload, Constants.MESSAGE_CHANNEL_PERIOD);
	}

	static setFrequency(channel: number, frequency: number): Buffer {
		let payload: number[] = [];
		payload = payload.concat(this.intToLEHexArray(channel));
		payload = payload.concat(this.intToLEHexArray(frequency));
		return this.buildMessage(payload, Constants.MESSAGE_CHANNEL_FREQUENCY);
	}

	static setRxExt(): Buffer {
		let payload: number[] = [];
		payload = payload.concat(this.intToLEHexArray(0));
		payload = payload.concat(this.intToLEHexArray(1));
		return this.buildMessage(payload, Constants.MESSAGE_ENABLE_RX_EXT);
	}

	static libConfig(channel: number, how: number): Buffer {
		let payload: number[] = [];
		payload = payload.concat(this.intToLEHexArray(channel));
		payload = payload.concat(this.intToLEHexArray(how));
		return this.buildMessage(payload, Constants.MESSAGE_LIB_CONFIG);
	}

	static openRxScan(): Buffer {
		let payload: number[] = [];
		payload = payload.concat(this.intToLEHexArray(0));
		payload = payload.concat(this.intToLEHexArray(1));
		return this.buildMessage(payload, Constants.MESSAGE_CHANNEL_OPEN_RX_SCAN);
	}

	static openChannel(channel: number): Buffer {
		let payload: number[] = [];
		payload = payload.concat(this.intToLEHexArray(channel));
		return this.buildMessage(payload, Constants.MESSAGE_CHANNEL_OPEN);
	}

	static closeChannel(channel: number): Buffer {
		let payload: number[] = [];
		payload = payload.concat(this.intToLEHexArray(channel));
		return this.buildMessage(payload, Constants.MESSAGE_CHANNEL_CLOSE);
	}

	static unassignChannel(channel: number): Buffer {
		let payload: number[] = [];
		payload = payload.concat(this.intToLEHexArray(channel));
		return this.buildMessage(payload, Constants.MESSAGE_CHANNEL_UNASSIGN);
	}

	static acknowledgedData  ( payload : number[] ) {
		return Messages.buildMessage( payload, Constants.MESSAGE_CHANNEL_ACKNOWLEDGED_DATA ) 
	}

	static broadcastData  ( payload : number[] ) {
		return Messages.buildMessage( payload, Constants.MESSAGE_CHANNEL_BROADCAST_DATA ) 
	}
	

	static buildMessage(payload: number[] = [], msgID = 0x00): Buffer {
		const m: number[] = [];
		m.push(Constants.MESSAGE_TX_SYNC);
		m.push(payload.length);
		m.push(msgID);
		payload.forEach((byte) => {
			m.push(byte);
		});
		m.push(this.getChecksum(m));
		return Buffer.from(m);
	}

	static intToLEHexArray(int: number, numBytes = 1): number[] {
		numBytes = numBytes || 1;
		const a: number[] = [];
		const b = Buffer.from(this.decimalToHex(int, numBytes * 2), 'hex');
		let i = b.length - 1;
		while (i >= 0) {
			a.push(b[i]);
			i--;
		}
		return a;
	}

	static decimalToHex(d: number, numDigits: number): string {
		let hex = Number(d).toString(16);
		numDigits = numDigits || 2;
		while (hex.length < numDigits) {
			hex = '0' + hex;
		}
		// console.log(hex);
		return hex;
	}

	static getChecksum(message: any[]): number {
		let checksum = 0;
		message.forEach((byte) => {
			checksum = (checksum ^ byte) % 0xFF;
		});
		return checksum;
	}
}