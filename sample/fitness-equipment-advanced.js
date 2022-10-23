const {FitnessEquipmentSensor} = require('incyclist-ant-plus');
const {AntDevice,AntServerBinding} = require('incyclist-ant-plus/lib/bindings')


const os = require('os')

const serverDebug = process.env.SERVER_DEBUG
const debug = process.env.ANT_DEBUG
const binaryPath = process.env.ANT_SERVER || '..\\bin\\antserver.exe'
let ant;

function initAnt() {
	if (os.platform()==='win32') {
		ant = new AntServerBinding({binaryPath,startupTimeout:5000 ,serverDebug,debug, logger:console})			
	}
	else {
		ant = new AntDevice({startupTimeout:2000})
	}
	return ant;	
}

async function scan(channel, timeout) {
	
	return new Promise( async resolve => {
		const sensor = new FitnessEquipmentSensor()
		let to;

		channel.attach(sensor)
		channel.on('detected' , async (profile,deviceID)=>{
			if (to) clearTimeout(to)
			await channel.stopScanner()
			resolve(Number(deviceID))
        })
		await channel.startScanner();
		if (timeout) {
			to  = setTimeout( async ()=>{
				await channel.stopScanner()
				resolve(-1)	
			}, timeout)
		}
	})

}

async function main( deviceID=-1) {
	initAnt();

	const opened = await ant.open()
	if (!opened) {
		console.log('could not open Ant Stick')
		return;
	}
	let channel;
	
	let id = deviceID
	if (deviceID===-1) { // scanning for device
		channel = await ant.getChannel();
		if (!channel) {
			console.log('could not open channel')
			return onAppExit()
		}
	
		console.log('Scanning for sensor(s)')
		id = await scan(channel,10000)
	}
	
	if (id===-1) {
		console.log('could not detect an FE device')
		return onAppExit()
	}

	console.log(`Connecting with id=${id}`)
	channel = await ant.getChannel();

	const sensor = new FitnessEquipmentSensor(id)
	channel.on('data', onData)

	console.log('start Sensor')
	const started = await channel.startSensor(sensor)

	if (started) {
		console.log('sensor started')
		simulateTraining(sensor)
	}
	else {
		console.log('could not start sensor')

	}

	
	
}

function onData(profile, deviceID,data) {
	console.log(`id: ANT+${profile} ${deviceID}`);
	console.dir(data)
}

async function onAppExit() {
	await ant.close();
	process.exit(0)
}


async function simulateTraining(sensor) {
	console.log(sensor)
	console.log( "set User Weight = 78kg, Bike Weight= 10kg" );
	console.log(await sensor.sendUserConfiguration(78,10));

	console.log( "set resistance to 20.5%" );
	console.log(await sensor.sendBasicResistance(20.5));	
	
	console.log( "set slope to 1.1%" );
	console.log(await sensor.sendTrackResistance	(1.1));
	
	console.log( "set wind resistance coeff 0.51 kg/m" );
	console.log(await sensor.sendWindResistance	(0.51));

	const start = Date.now()
	const finish = start + 10000; // 10s
	let targetPower = 30
	
	let iv = setInterval( async ()=>{
		if (Date.now()>finish) {
			clearInterval(iv)
			onAppExit()
		}
		else {
			console.log("set target power to " +targetPower + "W")
			console.log(await sensor.sendTargetPower(targetPower));
			targetPower+=10;
		}

	}, 1000 )
	
	
	
}



process.on('SIGINT',  async () => await onAppExit() );  // CTRL+C
process.on('SIGQUIT', async () => await onAppExit() ); // Keyboard quit
process.on('SIGTERM', async() => await onAppExit() ); // `kill` command


const args = process.argv.slice(2);
const deviceID = args.length>0 ? args[0] : undefined;

main( deviceID );


