const {HeartRateSensor} = require('incyclist-ant-plus');
const {AntDevice} = require('incyclist-ant-plus/lib/ant-device')

const ant = new AntDevice({startupTimeout:2000 /*,debug:true, logger:console*/})

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


	if (deviceID===-1) { // scanning for device
		console.log('Scanning for sensor(s)')
		const sensor = new HeartRateSensor()
        channel.on('data', onData)
		channel.startScanner()
		channel.attach(sensor)
	}
	else  {  // device ID known
		console.log(`Connecting with id=${deviceID}`)
		const sensor = new HeartRateSensor(deviceID)
        channel.on('data', onData)
		const started = await channel.startSensor(sensor)
        if (!started) {
            console.log('could not start sensor')
            ant.close();
        }
	} 
	
}

function onData(profile, deviceID,data) {
	console.log(`id: ANT+${profile} ${deviceID}, heart rate: ${data.ComputedHeartRate}`);
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
