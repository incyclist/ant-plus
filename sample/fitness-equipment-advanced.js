const {FitnessEquipmentSensor} = require('incyclist-ant-plus');
const {AntDevice} = require('incyclist-ant-plus/lib/ant-device')

const ant = new AntDevice({startupTimeout:2000})

async function main( deviceID=-1) {

	const opened = await ant.open()
	if (!opened) {
		console.log('could not open Ant Stick')
		return;
	}

	const channel = await ant.getChannel();
	if (!channel) {
		console.log('could not open channel')
		return onAppExit()
	}


	let id = deviceID
	if (deviceID===-1) { // scanning for device
		console.log('Scanning for sensor(s)')
		const sensor = new FitnessEquipmentSensor()
		channel.attach(sensor)
		const detected = await channel.startScanner();
		if (detected && detected.length>0)
			id = detected[0]
	}
	
	if (id===-1) {
		console.log('could not detect an FE device')
		return onAppExit()
	}

	console.log(`Connecting with id=${id}`)
	const sensor = new FitnessEquipmentSensor(id)
	channel.on('data', onData)
	await channel.startSensor(sensor)

	
	simulateTraining(sensor)

	
	
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
	console.log( "set User Weight = 78kg, Bike Weight= 10kg" );
	await sensor.sendUserConfiguration(78,10);
	
	console.log( "set resistance to 20.5%" );
	await sensor.sendBasicResistance(20.5);	
	
	console.log( "set slope to 1.1%" );
	await sensor.sendTrackResistance	(1.1);
	
	console.log( "set wind resistance coeff 0.51 kg/m" );
	await sensor.sendWindResistance	(0.51);

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
			await sensor.sendTargetPower(targetPower);
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


