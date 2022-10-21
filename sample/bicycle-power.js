const {BicyclePowerSensor} = require('incyclist-ant-plus');
const {AntDevice} = require('incyclist-ant-plus/lib/bindings')

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
		const bicyclePowerSensor = new BicyclePowerSensor()
		channel.startScanner()
		channel.attach(bicyclePowerSensor)
	}
	else  {  // device ID known
		console.log(`Connecting with id=${deviceID}`)
		const bicyclePowerSensor = new BicyclePowerSensor(deviceID)
		channel.startSensor(bicyclePowerSensor)

	} 
	
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


const args = process.argv.slice(2);
const deviceID = args.length>0 ? args[0] : undefined;

main( deviceID );

