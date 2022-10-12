const {BicyclePowerSensor,FitnessEquipmentSensor,HeartRateSensor} = require('incyclist-ant-plus');
const {AntDevice} = require('incyclist-ant-plus/lib/ant-device')

const ant = new AntDevice({startupTimeout:2000})

async function main() {

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
	channel.on('detected', onDetected)

	console.log('Scanning for sensor(s)')

	channel.attach(new BicyclePowerSensor())
	channel.attach(new HeartRateSensor())
	channel.attach(new FitnessEquipmentSensor())

	channel.startScanner()
	
}

function onDetected(profile, deviceID) {
	console.log(`detected device: ANT+${profile} ${deviceID}`);
}

function onData(profile, deviceID,data) {
	console.log(`id: ANT+${profile} ${deviceID}, cadence: ${data.Cadence}, power: ${data.Power}`);
}

async function onAppExit() {
	await ant.close();
	return 0;
}

process.on('SIGINT',  async () => await onAppExit() );  // CTRL+C
process.on('SIGQUIT', async () => await onAppExit() ); // Keyboard quit
process.on('SIGTERM', async() => await onAppExit() ); // `kill` command

main();

