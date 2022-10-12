const EventEmitter = require('events');
const {AntDevice} = require('incyclist-ant-plus/lib/ant-device')
const {HeartRateSensor,BicyclePowerSensor, FitnessEquipmentSensor} = require ('incyclist-ant-plus'); 

const PROFILE_HRM = 'HR'
const PROFILE_PWR = 'PWR'
const PROFILE_FE  = 'FE'

const Profiles = [
    { profile:PROFILE_HRM, Sensor: HeartRateSensor},    
    { profile:PROFILE_PWR, Sensor: BicyclePowerSensor},
    { profile:PROFILE_FE, Sensor: FitnessEquipmentSensor}
]

class AntService extends EventEmitter   {

    static _instance;
    static getInstance(props={}) {
        if (!AntService._instance)
            AntService._instance = new AntService(props)
        return AntService._instance
    }

    constructor( props={}) {
        super();
        this.isConnected = false;
        this.mode = undefined;        
        this.logger = props.logger;
        this.isDebugMode = props.debug===true
        this.activeScan = null;
        this.props = props;
    }

    log( str) {
        try {
            if (this.logger && this.logger.log)
                this.logger.log(str)
        } catch {}
    } 

    logEvent( event) {
        try {
            if (!event)
                return;
            if (this.logger && this.logger.logEvent)
                this.logger.logEvent(event)
            else {
                const str = Object.keys(event).map( k=>({key:k, data:event[k]}))
                            .reduce( (p,d,i)=> i===0? `${d.key}:${d.data}`:`${p}, ${d.key}:${d.data}` , '')
                this.log( str)
            }

        } catch {}
    } 



    async connect() {
        if (this.isConnected)
            return true;
        this.logEvent({message:'connecting ...'})

        const device = new AntDevice(this.props);
        const opened = await device.open();
        if (!opened) {
            this.logEvent({message:'could not connect'})
            return false;
        }

        this.device = device;  
        this.isConnected = true          
        this.logEvent({message:'connected'})
        return true

    }

    async disconnect() {
        if (!this.device)
            return true;
        const closed = await this.device.close();
        this.isConnected = !closed;
        return closed;          

    }



    onError( profile,error) {
        this.log( 'ERROR:', profile, error)
    }

    onData( profile,id, data,tag) {
        this.emit( 'data', profile, id, data,tag)
        //console.log( 'DATA:', profile, data)
    }

    async scan(props={}) {

        const detected = [];

        if (!this.isConnected) {
            const connected = await this.connect()
            if (!connected)
                return [];   
        }

        

        const onDetected = (profile,deviceID)=>{
            
            if (deviceID && detected.find( s => s.deviceID===deviceID && s.profile===profile)===undefined) {
                try {
                    if (props.onDetected) {
                        onDetected({profile,deviceID})
                    }               
                    detected.push( {profile,deviceID})                    
                    this.emit('detected', profile,deviceID)
                }
                catch(err) {
                    console.log(err)
                }
            }
        }

        let channel;

        if (!this.activeScan) {   
            channel = this.device.getChannel()
            channel.setProps({logger:this})
            if (!channel) 
                return [];  

            Profiles.forEach(( s,idx)=> {    
                const sensor = new s.Sensor()
                channel.attach(sensor)
            })
    
            channel.on('detected', onDetected)
            channel.on('data',this.onData.bind(this))
            await channel.startScanner()
            this.activeScan = channel;

            return new Promise( resolve => {
                setTimeout( async ()=>{
                    await this.stopScan()
                    this.emit('stop-scan')
                    channel.off('detected',onDetected)
                    channel.off('data',this.onData.bind(this))
                    resolve(detected)
                }, props.timeout||5000)       
        
            })
            
        }
        else {
            channel = this.activeScan
            channel.on('data',this.onData.bind(this))
            channel.on('detected', onDetected)
            this.once( 'stop-scan' ,()=>{
                channel.off('detected',onDetected)
                channel.off('data',this.onData.bind(this))
                resolve(detected)
            })
        }

    }

    async stopScan() {
        this.logEvent({message:'stopping scan ..'})

        if (!this.activeScan)
            return false;


        const channel = this.activeScan
    
        try {
            const stopped = await channel.stopScanner()
            this.activeScan = undefined

            return stopped
        }
        catch(err) {
            console.log('ERROR',err)
            return false;
        }       

    }


    async connectSensor( info, props={}) {

        if (!this.isConnected) {
            const connected = await this.connect()
            if (!connected)
                return null;   
        }

        const profileInfo = Profiles.find( p=> p.profile===info.profile)
        if (!profileInfo || !this.device)
            return null;

        const channel = this.device.getChannel()
        channel.setProps({logger:this})
        if (!channel)
            return null;            
        const sensor = new profileInfo.Sensor(info.deviceID)

        channel.on('data',this.onData.bind(this))
        const started = await channel.startSensor(sensor)
        if (!started)
            return null;

        return sensor;
    }

    async disconnectSensor( sensor ) { 
        if (!this.isConnected || !this.device) 
            return true

        const channel = sensor.getChannel()
        return await channel.stopSensor(sensor)

    }
}




const service = AntService.getInstance({logger:console,debug:true,startupTimeout:5000})
const onDetected = (profile,id) => {console.log( `found profile ${profile} id:${id}`)}

service.on('detected',onDetected)
//service.on('data', (profile, id, data, tag)=> { console.log( `got data: [${profile}-${id}]`,data)})


const main = async () => {
    let detected;


    console.log( 'scan #1')
    detected = await service.scan({timeout:5000})
    console.log('sensors:',detected)
    
    if (detected && detected.length>0 ) {


        const hrm = detected.filter( s=>s.profile===PROFILE_HRM);
        hrm.forEach( async (sensorInfo,i) => {
            if (sensorInfo) {
                try {
                    const sensor = await service.connectSensor(sensorInfo)
                    if (sensor)
                        service.on('data', (profile, id, data, tag)=> { console.log( `got data: [${profile}-${id}]`,data)})
                    setTimeout( async()=>{
                        await service.disconnectSensor(sensor)
                        if (i===0) {
                            setTimeout( async ()=>{await service.disconnect()}, 500 )
                            
                        }
                    } ,5000)
        
                }
                catch(err) {
                    console.log(err)
                }
            }
        })

        /*
        const power = detected.filter( s=>s.profile===PROFILE_PWR);
        power.forEach( async (sensorInfo,i) => {
            if (sensorInfo) {
                try {
                    const sensor = await service.connectSensor(sensorInfo)
                    if (sensor)
                        service.on('data', (profile, id, data, tag)=> { console.log( `got data: [${profile}-${id}]`,data)})
                    setTimeout( async()=>{
                        await service.disconnectSensor(sensor)
                        if (i===0) {
                            setTimeout( async ()=>{await service.disconnect()}, 500 )
                            
                        }
                    } ,5000)
        
                }
                catch(err) {
                    console.log(err)
                }
            }
        })
        */

        /*
        const fe = detected.filter( s=>s.profile===PROFILE_FE);
        fe.forEach( async (sensorInfo,i) => {
            if (sensorInfo) {
                try {
                    const sensor = await service.connectSensor(sensorInfo)
                    if (sensor)
                        service.on('data', (profile, id, data, tag)=> { console.log( `got data: [${profile}-${id}]`,data)})

                    console.log('running test on ANT+FE ',sensor.getDeviceID())
                    let targetPower = 100;
                    const iv = setInterval( async ()=>{
                        await sensor.sendTargetPower( targetPower +20)
                    }, 1000)

                    setTimeout( async()=>{
                        console.log('stopping test on ANT+FE ',sensor.getDeviceID())
                        await service.disconnectSensor(sensor)
                        clearInterval(iv)
                        if (i===0) {
                            setTimeout( async ()=>{await service.disconnect()}, 500 )
                            
                        }
                    } ,5000)
        
                }
                catch(err) {
                    console.log(err)
                }
            }
        })
        */

    }
    else {
        await service.disconnect();        
    }
    

    /*
    console.log( 'scan #2')
    sensors = await service.scan({timeout:5000})
    console.log('sensors:',sensors)
    await service.stopScan()
    await service.disconnect();    

    console.log( 'scan #3')
    sensors = await service.scan({timeout:5000})
    console.log('sensors:',sensors)
    await service.stopScan()
    await service.disconnect();    

      */  
        
}

main()
