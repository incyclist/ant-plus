import EventEmitter from 'events'
import { FitnessEquipmentSensor } from '../sensors';
import  {AntServerBinding} from '../bindings'

jest.setTimeout(60000000)
  
type RequestResponseMap = {
    request: string;
    response: string;
}

class MockBinding extends AntServerBinding {

    emitter: EventEmitter;

    openResponse: string = 'true'
    responseMap: RequestResponseMap[] = [];

    // ---- Overwite methods

    async startServer():Promise<boolean> {
        
        
        return Promise.resolve(true)
    }
    stopServer():void {}
    onServerError(err): void  {}
    onServerStopped():void {}

    sendServerMessage( message:string): boolean { 
        return this.onClientMessage( message)
    }

    sendServerRequest( command:string,...args): boolean { 
        const parts = command.split('/')
        return this.onClientRequest( parts[1], parts[2], args)
    }

    sendServerPing( ): boolean {
        return true;
    }

    async open(): Promise<boolean> {
        this.maxChannels = 8;
        this.channels = []
        for (let i =0; i<this.maxChannels; i++) this.channels.push( null as any)
        return true;
    }

    async close(): Promise<boolean> {
        this.channels = []
        return true;
    }

    // -------

    onClientRequest(id,command,args):boolean {
        if (command==='open') {
            this.sendClientResponse(`response/${id}/open/${this.openResponse}`)
        }
        return true;
    }

    simulateMessage(message:string) {
        this.sendClientResponse(`message/${message}`)
    }

    sendClientResponse(message:string):void {
        this.onServerData(message+'\n')
    }

    onClientMessage(message:string):boolean {
        const str = message.split('\n')[0]

        const mapItem = this.responseMap.find( m=>m.request===str)
        if (mapItem)
            this.simulateMessage(mapItem.response)
        else {
            console.log('unmapped message',message)
        }

        return true;
    }


    mapResponses(data:RequestResponseMap | RequestResponseMap[]):void {
        if (!Array.isArray(data))
            this.responseMap.push(data)
        else 
            this.responseMap.push(...data)
    }

}

describe('FE' ,()=>{

    let ant,channel,sensor,onData;

    const setResponseForNextMessage = (s,response) => {
        const send = s.send.bind(s);
        const nextIdx = ant.responseMap.length

        s.send = (data,props) => {
            const message = data.toString('hex')
            const request = message.substring(4)
            
            ant.mapResponses( {request, response})
            const res = send(data,props)
            s.send = send;
            return res
        }

        return nextIdx
    }
    
    const resetResponseForPrevMessage = (idx) => { 
        ant.responseMap.splice(idx,1)
    }
    
    beforeAll( async ()=>{
        ant = new MockBinding({});
        ant.mapResponses( [

            // start channel for sensor
            {request: '42000000e5', response: 'a40340004200'},
            {request: '51006712110094', response: 'a40340005100'},
            {request: '4400ff1d', response: 'a40340004400'},
            {request: '450039da', response: 'a40340004500'},
            {request: '43000020c4', response: 'a40340004300'},
            {request: '6e00e028', response: 'a40340006e00'},
            {request: '4b00ee', response: 'a40340004b00'},

            // close channel
            {request:'4c00e9', response: 'a40340000107' },
            {request:'4100e4', response: 'a40340004100' },
        
        ])

    })

    beforeEach( async ()=> {
        jest.useFakeTimers()
        const opened = await ant.open()  
        channel = await ant.getChannel();
        sensor = new FitnessEquipmentSensor(4711)
  
    })

    afterEach( async ()=>{
        jest.useRealTimers()
        await ant.close()

    })

    test('bugfix:crash',async ()=>{
        const onData = jest.fn()
        channel.on('data', onData)
        const started = await channel.startSensor(sensor)

        // send one valid message to populate data
        ant.simulateMessage('a4144e001019fd259d270035e067121105100068004886')
        expect(onData).toHaveBeenLastCalledWith ('FE',4711,expect.objectContaining({"DeviceID": 4711, "Distance": 37}))

        // simulate illegal message
        ant.simulateMessage('de')

        // next message should still be processed
        ant.simulateMessage('a4144e001019fd269d270035e067121105100068004886')
        expect(onData).toHaveBeenLastCalledWith ('FE',4711,expect.objectContaining({"DeviceID": 4711, "Distance": 38}))
      
        
    })
    
    test('bugfix: no data after channel restart',async ()=>{

        jest.useRealTimers()
        const onData = jest.fn()
        channel.on('data', onData)
        const started = await channel.startSensor(sensor)


        // send one valid message to populate data
        ant.simulateMessage('a4144e001019fd259d270035e067121105100068004886')
        expect(onData).toHaveBeenLastCalledWith ('FE',4711,expect.objectContaining({"DeviceID": 4711, "Distance": 37}))

        let id = setResponseForNextMessage(sensor,'a40340004f1f')
        const res1 = await sensor.sendTrackResistance(0.1)
        resetResponseForPrevMessage(id);
        expect(res1).toBeFalsy();

        // simulate an success event for next message
        /*
        id = setResponseForNextMessage(sensor,'a40340000105')
        const res2 = await sensor.sendTrackResistance(0.2)
        resetResponseForPrevMessage(id);
        expect(res2).toBeTruthy();
*/
        // next message should still be processed
        await setTimeout( ()=>Promise.resolve(true),3000 )

        ant.simulateMessage('a4144e001019fd269d270035e067121105100068004886')
        expect(onData).toHaveBeenLastCalledWith ('FE',4711,expect.objectContaining({"DeviceID": 4711, "Distance": 38}))
      
        
    })

})