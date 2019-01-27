const Ant = require('gd-ant-plus');
const Queue = require('queue-fifo');
const Constants = Ant.Constants;
const Messages = Ant.Messages;

const stick = new Ant.GarminStick2;
var sensor = undefined;
var scanner = undefined;

const TIMEOUT_ACK = 500;
const TIMEOUT_SCAN = 2000;

start();

function send(msg,stick,callback) {
	if (stick.queue==undefined) {
		stick.queue=new Queue();
	}
	stick.queue.enqueue( { msg:msg, callback:callback} );
	if (stick.workerId==undefined ) startWorker(stick);
}

function startWorker(stick) {
	stick.workerId = setInterval( sendFromQueue, 100,stick);
}

function sendFromQueue(stick) {

	if (stick==undefined || stick.queue==undefined || stick.queue.isEmpty() )
		return;
	
	if (stick.currentCmd!=undefined) {
		if (stick.currentCmd.response==undefined) {
			let timeout = stick.currentCmd.timeout;
			if (timeout==undefined) timeout = TIMEOUT_ACK ;
			
			let duration = Date.now()-stick.currentCmd.tsStart;
			if (duration>timeout) {
				let callback = stick.currentCmd.callback;
				stick.currentCmd=undefined;
				if (callback!=undefined) {
					callback( undefined, { error: "timeout"} )
				}
			}
		}
		else {
			let callback = stick.currentCmd.callback;
			let response = stick.currentCmd.response;
			stick.currentCmd=undefined;
			if (callback!=undefined) {
				callback( response )
			}
			
		}
	}
	else {
		stick.currentCmd = stick.queue.dequeue();
		stick.currentCmd.tsStart = Date.now();
		let msg = stick.currentCmd.msg;
		stick.write(msg);
	}

}

function sendUserConfiguration (stick, userWeight, bikeWeight, wheelDiameter, gearRatio) {
	var payload = [];
	payload.push ( stick.channel);

	var m = userWeight==undefined ? 0xFFFF : userWeight;
	var mb = bikeWeight==undefined ? 0xFFF: bikeWeight;
	var d = wheelDiameter==undefined ? 0xFF : wheelDiameter;
	var gr = gearRatio==undefined ? 0x00 : gearRatio;
	var dOffset = 0xFF;

	if (m!=0xFFFF)
		m = Math.trunc(m*100);
	if (mb!=0xFFF)
		mb = Math.trunc(mb*20);        
	if (d!=0xFF) {
		d = d*1000;
		dOffset = d%10;
		d = Math.trunc(d/10);
	}
	if (gr!=0x00) {
		gr= Math.trunc(gr/0.03);
	}

	payload.push (0x37);                        // data page 55: User Configuration
	payload.push (m&0xFF);                      // weight LSB
	payload.push ((m>>8)&0xFF);                 // weight MSB
	payload.push (0xFF);                        // reserved
	payload.push (((mb&0xF)<<4)|(dOffset&0xF)); //  bicycle weight LSN  and 
	payload.push ((mb>>4)&0xF);                 // bicycle weight MSB 
	payload.push (d&0xFF);                      // bicycle wheel diameter 
	payload.push (gr&0xFF);              		// gear ratio 

	let msg = Messages.acknowledgedData(payload);
	send (msg,stick);
}

function sendBasicResistance( stick, resistance) {
	var payload = [];
	payload.push ( stick.channel);

	var res = resistance==undefined ?  0 : resistance;
	
	res = res / 0.5;

	payload.push (0x30);                        // data page 48: Basic Resistance
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (res&0xFF);              		// resistance 

	let msg = Messages.acknowledgedData(payload);
	send (msg,stick);
}

function sendTargetPower( stick, power) {
	var payload = [];
	payload.push ( stick.channel);

	var p = power==undefined ?  0x00 : power;

	p = p * 4;

	payload.push (0x31);                        // data page 49: Target Power
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (p&0xFF);                      // power LSB
	payload.push ((p>>8)&0xFF);                 // power MSB 

	let msg = Messages.acknowledgedData(payload);
	send( msg,stick);
}

function sendWindResistance( stick, windCoeff,windSpeed,draftFactor) {
	var payload = [];
	payload.push ( stick.channel);

	var wc = windCoeff==undefined ? 0xFF : windCoeff;
	var ws = windSpeed==undefined ? 0xFF : windSpeed;
	var df = draftFactor==undefined ? 0xFF : draftFactor;

	if (wc!=0xFF) {
		wc = Math.trunc(wc/0.01);
	}
	if (ws!=0xFF) {
		ws = Math.trunc(ws+127);
	}
	if (df!=0xFF) {
		df = Math.trunc(df/0.01);
	}

	payload.push (0x32);                        // data page 50: Wind Resistance
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (wc&0xFF);                     // Wind Resistance Coefficient
	payload.push (ws&0xFF);                     // Wind Speed
	payload.push (df&0xFF);                     // Drafting Factor

	let msg = Messages.acknowledgedData(payload);
	send ( msg,stick);
}

function sendTrackResistance( stick, slope, rrCoeff) {
	var payload = [];
	payload.push ( stick.channel);

	var s  = slope==undefined ?  0xFFFF : slope;
	var rr = rrCoeff==undefined ? 0xFF : rrCoeff;

	if (s!=0xFFFF) {
		s = Math.trunc((s+200)/0.01);
	}
	if (rr!=0xFF) {
		rr = Math.trunc(rr/0.00005);
	}

	payload.push (0x33);                        // data page 51: Track Resistance 
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (0xFF);                        // reserved
	payload.push (s&0xFF);                      // Grade (Slope) LSB
	payload.push ((s>>8)&0xFF);                 // Grade (Slope) MSB
	payload.push (rr&0xFF);                     // Drafting Factor

	let msg = Messages.acknowledgedData(payload);
	send( msg, stick);
}

function initSensor() {
	sensor = new Ant.FitnessEquipmentSensor(stick);	
	
	sensor.on('eventData', function (data) {
		
		// EVENT_RX_FAIL
		if ( data.message==1 && data.code==2) {
			// can be ignored 
			return;
		}

		// EVENT_TRANSFER_TX_COMPLETED
		if ( stick.currentCmd!=undefined && data.message==1 && data.code==5) {
			stick.currentCmd.response = { success:true }
			return;
		}

		// EVENT_TRANSFER_TX_FAILED
		if ( stick.currentCmd!=undefined && data.message==1 && data.code==6) {
			stick.currentCmd.response = { success:false }
			return;
		}

		// TRANSFER_IN_PROGRESS 
		if ( stick.currentCmd!=undefined && data.message==Constants.MESSAGE_CHANNEL_ACKNOWLEDGED_DATA && data.code==31) {
			// resend
			stick.currentCmd.tsStart = Date.now();
			let msg = stick.currentCmd.msg;
			stick.write(msg);
			return;
		}

		console.log( "Incoming Event:"+ JSON.stringify(data));

	});

	sensor.on('fitnessData', function (data) {
		
		let info = {
			status: data.TrainerStatus,
			distance: data.Distance,
			power: data.InstantaneousPower,
			slope: data.Incline,
			speed: ( data.VirtualSpeed!=undefined ? data.VirtualSpeed : data.RealSpeed),
			cadence: data.Cadence,
			hrm: data.HeartRate,
			hrmSrc: data.HeartRateSource
		}
		
		console.log(  data.RawData[4]+"["+data.DeviceID+"]"+ ":"+ hexstr(data.RawData,4,8)+" "+JSON.stringify(info));
		
	});
	sensor.on('attached', function() { 
		console.log('sensor attached'); 
		sensorReady = true; 
		stick.paired=true;

		// start simulation of a training session
		stick.trainingInterval = setInterval( simulateTraining, 1000);		
	});
	sensor.on('detached', function() { 
		console.log('sensor detached'); 
		sensorReady = false
	});
	
}

function initScanner() {
	scanner = new Ant.FitnessEquipmentScanner(stick);
	scanner.on('fitnessData', function (data) {
		if (stick.antfe==undefined) {
			stick.antfe = [];
		}	
		var found = false;
		for (var i;i<stick.antfe.length;i++) {
			if ( stick.antfe[i]==data.DeviceID) {
				found = true;
			}
		}
		if (!found) {
			stick.antfe.push(data.DeviceID);
		}
		console.log(  data.RawData[4]+"["+data.DeviceID+"]"+ ":"+ hexstr(data.RawData,4,8));
	
	});
	scanner.on('attached', function() { 
		console.log('scanner attached'); 
		stick.scanner = scanner; 
	});
	scanner.on('detached', function() { 
		console.log('scanner detached'); 
		stick.scanner = undefined; 
		pair();
	});

	console.log("Start scanning for ANT+FE Device");
	stick.startScan = Date.now();
	scanner.scan();
	stick.scanningInterval = setInterval(scanForDevice,1000);

}
 
function scanForDevice() {

	if (!stick.paired) {
		if (stick.startScan!=undefined) {
			 let	 ts = Date.now();
			 if (ts-stick.startScan< TIMEOUT_SCAN ) {
				return; // continue scanning
			 }
			 else {
				console.log("Finished scanning for ANT+FE device");
				scanner.detach(scanner.channel);
				clearInterval(stick.scanningInterval);
			 }
		}
		return;
	}
}

function simulateTraining() {

	if (stick.trainingCnt==undefined) {
		stick.trainingCnt=0;
	}

	switch ( stick.trainingCnt++) {
		case 0: 
			console.log( "set User Weight = 78kg, Bike Weight= 10kg" );
			sendUserConfiguration(stick,78,10);
			return;
		case 1: 
			console.log( "set resistance to 20.5%" );
			sendBasicResistance(stick,20.5);
			return;
		case 2:
			console.log( "set slope to 1.1%" );
			sendTrackResistance	(stick, 1.1);
		case 3:
			console.log( "set wind resistance coeff 0.51 kg/m" );
			sendWindResistance	(stick, 0.51);
		default:
			if ( stick.simulateStart==undefined) {
				stick.simulateStart=Date.now();
				stick.simulateStepStart = Date.now();
				stick.targetPower = 30;
				stick.direction = 1;
				console.log("set target power to " +stick.targetPower + "W")
				sendTargetPower(stick,stick.targetPower);
				return;
			}
		
			if (stick.targetPower==200 || stick.targetPower==20) {
				stick.direction = -1* stick.direction;
			}
				
			if (stick.simulateStepStart!=undefined) {
				ts = Date.now();
				if ((ts-stick.simulateStepStart)>10000) {
					stick.targetPower += (5*stick.direction);
					console.log("set target power to " +stick.targetPower + "W")
					sendTargetPower(stick,stick.targetPower);
				}
			}	
	
	}



}

function pair() {
	// If we have found at least one device,connect with the first device we have found
	if (stick.antfe!=undefined && stick.antfe.length>0) {
		initSensor();
		sensor.attach(0,stick.antfe[0]);	

	}
	else {
		console.log("No devices found");
		process.exit();
	}
}


function hexstr(arr,start,len) {
    var str = "";
    if (start==undefined) 
        start = 0;
    if ( len==undefined) {
        len = arr.length;
    }
    if (len-start>arr.length) {
        len = arr.length-start;
    }

    var j=start;
    for (var i = 0; i< len; i ++) {
		var hex = Math.abs( arr[j++]).toString(16);
		if (hex.length<2) 
			hex="0"+hex;
        if ( i!=0 ) str+=" ";
        str+=hex;
    }
	return str;
}


function start() {
	
	stick.on('startup', function() {

		console.log('startup');
		console.log('Max channels:', stick.maxChannels);

		initScanner();
	});
	
	stick.on('shutdown', function() {
		console.log('shutdown');
		scanner.detach(scanner.channel);
	});

	if (stick.is_present()) {	
		if (!stick.open()) {
			console.log('Stick could not be opened!');
		}
	}
	else {
		console.log('Stick not found');
	}
		
}
