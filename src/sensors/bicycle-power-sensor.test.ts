import { IChannel } from "../types"
import { BicyclePowerSensor } from "./"

const createMockChannel = (channelNo, device) =>  {
    const mockChannel:IChannel = {
        getChannelNo: () => channelNo,
        getDevice: jest.fn(() => device),
        setProps: jest.fn(),
        getProps: jest.fn(),
        onMessage: jest.fn(),
        onDeviceData: jest.fn(),
        startScanner: jest.fn(),
        stopScanner: jest.fn(),
        attach: jest.fn(),
        startSensor: jest.fn(),
        stopSensor: jest.fn(),
        sendMessage: jest.fn(),
        flush: jest.fn()
    }
    return mockChannel
}

describe( 'BicyclePowerSensor',()=> {
    describe('onEvent', ()=>{
        test(`RX_FAILED event`, ()=>{
            const data = Buffer.from('a40340000102e4','hex')

            const sensor = new BicyclePowerSensor(30529, createMockChannel(0,null))
            
            let error;
            try {
                sensor.onEvent(data)
            }
            catch(err) {
                error = err
            }
            expect(error).toBeUndefined()


        })
    })    
})