import { ChildProcess, spawn } from "child_process";
import {IAntDevice,AntDeviceProps } from "../types";
import { PassThrough } from 'stream'
import { AntDevice } from "../ant-device";

//import split from 'split'

const DEFAULT_BINARY_PATH = 'antserver.exe'
const MAX_PING_TIMEOUT = 3000;
// Time that close() waits for the server to confirm a close request. A healthy server needs up to ~1s, as closing the
// USB stick waits for the receive thread. The caller (interface disconnect) gives up after 1s, so this has to stay below.
const CLOSE_TIMEOUT = 800;

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
    protected lastPingTS: number

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

            this.server.stdout.on('error',(err)=> {this.logEvent({message:'ANT+ output error',error:err.message})})
            this.server.stdin.on('error',(err)=> {this.logEvent({message:'ANT+ input error',error:err.message})})                    
            this.server.stdout.pipe(new PassThrough()) //.pipe(split())
            //.on( 'data', this.onServerMessage.bind(this))
            .on( 'data',this.onServerData.bind(this))
            return resolve(true)
    
        })
    }

    stopServer(closeConfirmed:boolean=false, closeDurationMs:number=0):void {

        const server = this.server
        if (!server)
            return;

        this.server = undefined

        server.removeAllListeners()
        server.stdout?.unpipe()
        server.stdout?.removeAllListeners()
        // the streams can still emit an error while the process is going down, without a listener that would throw
        server.stdout?.on('error',()=>{})
        server.stdin?.on('error',()=>{})
        this.serverData = ''

        server.kill()
        this.logEvent({message:'stopping ANT+ Server', closeConfirmed, closeDurationMs})

        // requests that are still waiting will never be answered
        const pending = Object.values(this.requests)
        this.requests = {}
        pending.forEach( r => r.reject(new Error('ANT+ Server stopped')) )
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
                    delete this.requests[requestId]
                    parts.splice(0,2)
                    request.resolve(...parts)
                }
            }
            else if (parts[0]==='message') {
                const data = Buffer.from(parts[1],'hex')
                this.onMessage(data)
            }
            else if (parts[0]==='error') { 
                const message = parts[2]
                this.logEvent( {message:'ANT+Server error',error:message})

            }
            else if (parts[0]==='debug') { 
                if (parts[2]==='ping')
                    this.lastPingTS = Date.now()

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
 
            if (this.lastPingTS!==undefined)   {
                const ts = Date.now()-this.lastPingTS;
                if (ts>MAX_PING_TIMEOUT) {
                    this.logEvent( {message:'ping timeout'})
                    this.lastPingTS = undefined;
                }

            }

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
                }
                else {
                    this.logEvent({message:'ANT+ device could not be opened',reason:'open failed'})
                    // has to be awaited: the server is stopped asynchronously and a new open() must not find the old server still in place
                    await this.close();
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
        if (!this.server)
            return false;

        if (this.pingIv) {
            clearInterval(this.pingIv)
            this.pingIv = undefined;
        }

        const start = Date.now()
        let closed = false;
        try {
            closed = await this.sendCloseRequest()
        }
        catch(err) {
            this.logEvent({message:'ANT+ Server close request failed', error:err.message})
        }

        // The server process is stopped in any case: a server that does not answer (e.g. because it is stuck while
        // closing the USB stick) must not be left running, it would stay alive next to the server of the next open()
        this.stopServer(closed, Date.now()-start)
        return closed
    }

    // resolves with true if the server confirmed the close request, with false if it did not answer in time
    protected async sendCloseRequest(): Promise<boolean> {
        let timer: NodeJS.Timeout
        const timeout = new Promise<boolean>( resolve => { timer = setTimeout( ()=>resolve(false), CLOSE_TIMEOUT) })

        try {
            // the response to a close request has no payload, so the confirmation is the response itself, not its content
            return await Promise.race([ this.sendRequest('close').then( ()=>true), timeout])
        }
        finally {
            clearTimeout(timer)
        }
    }


    write(data: Buffer): void {
		if (this.props.debug) {
			this.logEvent({message:'ANT+ SEND', data:data.toString('hex')});
		}

        const payload = data.slice(2)
        //payload.splice(0,2)
        this.sendServerMessage( payload.toString('hex') )
    }


}