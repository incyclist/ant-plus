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
		return;
	}

	channel.on('data', onData)

	if (deviceID===-1) { // scanning for device
		console.log('Scanning for sensor(s)')
		const sensor = new FitnessEquipmentSensor()
		channel.startScanner()
		channel.attach(sensor)
	}
	else  {  // device ID known
		console.log(`Connecting with id=${deviceID}`)
		const sensor = new FitnessEquipmentSensor(deviceID)
		channel.startSensor(sensor)

	} 
	
}

function onData(profile, deviceID,data) {
	console.log(`id: ANT+${profile} ${deviceID}`);
	console.dir(data)
}

async function onAppExit() {
	await ant.close();
	return 0;
}

process.on('SIGINT',  async () => await onAppExit() );  // CTRL+C
process.on('SIGQUIT', async () => await onAppExit() ); // Keyboard quit
process.on('SIGTERM', async() => await onAppExit() ); // `kill` command


const args = process.argv.slice(2);
const deviceID = args.length>0 ? args[0] : undefined;

main( deviceID );