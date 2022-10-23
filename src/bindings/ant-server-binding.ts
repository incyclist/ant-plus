import { ChildProcess, spawn } from "child_process";
import {IAntDevice } from "incyclist-ant-plus";
import { AntDeviceProps } from "incyclist-ant-plus/lib/types";
import stream, { PassThrough } from 'stream'
import { AntDevice } from "../ant-device";

//import split from 'split'

const DEFAULT_BINARY_PATH = 'antserver.exe'

export interface AntServerDeviceProps extends AntDeviceProps  {
    binaryPath?: string
    serverDebug?: boolean
}

export type RequestInfo = {
    message,
    resolve,
    reject
}

export type Requests =  {
    [id: string]  : RequestInfo 
}


export default class AntServerBinding extends AntDevice implements IAntDevice{

    protected props:AntServerDeviceProps;
    protected server: ChildProcess
    protected requests: Requests 
    protected serverData: string;
    protected pingIv: NodeJS.Timeout

    constructor( props:AntServerDeviceProps) {
        super(props)
        this.props = props||{}
        this.server = undefined
        this.requests = {}
        this.serverData = ''
    }

    protected getDevices(){
        return [];
    }
    
    protected launchServer(path):ChildProcess {
        return spawn(path,[])
    }

    async startServer():Promise<boolean> {

        if (this.server)
            return;

        return new Promise( resolve => {
            this.logEvent({message:'starting ANT+ Server'})
            const path = this.props.binaryPath || DEFAULT_BINARY_PATH;
    
   
            let error;
            try {
                this.server = this.launchServer(path)

                if (!this.server) {
                    this.logEvent({message:'ANT+ Server could not be started'})
                    return resolve(false)
                }

                this.server.once('error', (err)=>{                    
                    this.logEvent({message:'ANT+ Server could not be started',error:err.message})
                    return resolve(false);
                } )
                this.server.on('spawn',()=>{
                    this.logEvent({message:'ANT+ Server spawned'})
                    this.server.on('error',this.onServerError.bind(this))        
                })
            }
            catch(err) {
                error = err.message
            }
            
            if (!this.server) {
                this.logEvent({message:'ANT+ Server could not be started',error})
                return resolve(false);
            }

            this.server.on('close',this.onServerStopped.bind(this))

            this.server.stdout.on('error',console.log)
            this.server.stdin.on('error',console.log)                    
            this.server.stdout.pipe(new PassThrough()) //.pipe(split())
            //.on( 'data', this.onServerMessage.bind(this))
            .on( 'data',this.onServerData.bind(this))
            return resolve(true)
    
        })
    }

    stopServer():void {

        if (!this.server)
            return;
        this.logEvent({message:'stopping ANT+ Server'})
    }

    onServerError(err): void {
        if (!this.server)
            return;
        this.logEvent({message:'ANT+ Server error', error:err.message})

    }

    onServerStopped():void {
        this.server.removeAllListeners()
        this.server = undefined
    }

    
    onServerData(data) {
        const str = data.toString();
        const lines = str.split(/\r?\n/);

        if (this.serverData) {
            lines[0] = this.serverData+lines[0];
        }

        if ( str.charAt[str.length-1]!=='\r' && str.charAt[str.length-1]!=='\n') {
            const removed = lines.splice(-1)
            if (removed)
                this.serverData = removed[0]
        }

        lines.forEach( line =>  this.onServerMessage(line))
    }
    

    onServerMessage(str:string) {
        try {
            if (this.props.serverDebug && !str.startsWith('debug/ping'))
                this.logEvent({message: 'Ant+ Server [IN]:', msg:str });


            const parts = str.split('/')
            if (parts[0]==='response') {
                const requestId = parts[1]
                const request = this.requests[requestId];
                if (request) {
                    parts.splice(0,2)
                    request.resolve(...parts)
                }
            }
            else if (parts[0]==='message') {
                const data = Buffer.from(parts[1],'hex')
                this.onMessage(data)
            }
            else if (parts[0]==='error') { 

            }
            else if (parts[0]==='debug') { 

            }

        }
        catch(err) {
            this.logEvent( {message:'error',fn:'onServerMessage()', error:err.message||err, stack:err.stack})
        }
    } 

    sendServerMessage( message:string): boolean {
        try {
            
            const output = `message/${message}`
            if (this.props.serverDebug)
                this.logEvent({message: 'Ant+ Server [OUT]:', msg:output });
            this.server.stdin.write( `${output}\n`)        
            return true;
        }
        catch(err) {
            this.logEvent({message: 'Ant+ Server out error:', error:err.message});
            return false;
        }
    }

    sendServerPing( ): boolean {
        
        try {
            
            const output = `ping/${Date.now()}`
            //if (this.props.serverDebug)
            //    this.logEvent({message: 'Ant+ Server [OUT]:', msg:output });
            this.server.stdin.write( `${output}\n`)        
            return true;
        }
        catch(err) {
            this.logEvent({message: 'Ant+ Server out error:', error:err.message});
            return false;
        }
        
       return true;
    }

    async sendRequest(command:string,...args): Promise<any>  {
        return new Promise((resolve, reject) => {
            const requestId = Date.now();

            let message:string= command;
            if (args)
                message += args.reduce( (p,c) => `${p}/${c}`,'')

            this.requests[requestId] = { message,resolve, reject };
            try {
                const output = `request/${requestId}/${message}`
                if (this.props.serverDebug)
                    this.logEvent({message: 'Ant+ Server [OUT]:', msg:output});

                this.server.stdin.write( `${output}\n`)        
            }
            catch (err) {
                this.logEvent({message: 'Ant+ Server request out error:', error:err.message, requestId});
                reject(err)
            }
        });
    }


    async open(): Promise<boolean> {
        await this.startServer();  
        
        if (this.server) {

            try {
                const {deviceNo=0} = this.props;
                this.logEvent({message:'opening ANT+ device',deviceNo})
                
                const res = await this.sendRequest('open',deviceNo )                
                if ( res===true || res==='true') {

                        if (!this.pingIv)
                            this.pingIv = setInterval( ()=> {   this.sendServerPing(); }, 100)

                        const started = await this.startup(this.props.startupTimeout);
                        if (!started) {
                            await this.close();
                            this.logEvent({message:'ANT+ device could not be opened',reason:'startup failed'})
                            return false;
                        }
            
                        this.deviceNo = deviceNo
                        this.channels = [];
                        for (let i =0; i<this.maxChannels; i++) this.channels.push(null)
                        this.logEvent({message:'ANT+ device opened',deviceNo})
                        return true;
            


                    return true
                }
                else {
                    this.logEvent({message:'ANT+ device could not be opened',reason:'open failed'})
                    this.close();
                    return false;
                }
            }
            catch(err) {
                this.logEvent({message:'ANT+ device could not be opened',reason:'error', error:err.message})
                return false;
            }

        }
        
        
    }

    async close(): Promise<boolean> {
        if (this.server) {

            if (this.pingIv) {
                clearInterval(this.pingIv)
                this.pingIv = undefined;
            }

            const res = await this.sendRequest('close')
            
            if(res) {
                this.stopServer()
                return true;
            }
            return false;
        }
        return false;
    }


    write(data: Buffer): void {
		if (this.props.debug) {
			const logger = this.props.logger || console;
			this.logEvent({message:'ANT+ SEND', data:data.toString('hex')});
		}

        const payload = data.slice(2)
        //payload.splice(0,2)
        this.sendServerMessage( payload.toString('hex') )
    }


}