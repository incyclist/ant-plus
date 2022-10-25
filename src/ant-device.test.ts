import Channel  from './ant-channel'
import {AntDevice} from './ant-device'

describe('AntDevice',()=>{
    describe('onMessage',()=>{

        test('Valid Message',()=>{
            const logger = { logEvent:jest.fn(), log:jest.fn() }
            const channel = new Channel(0,null as any,{})
            channel.onMessage = jest.fn()
            const device = new AntDevice({logger})
            device['channels'] = [ channel]

            const data = Buffer.from('a4144e0010193ddb00005c35e02e0a110510006800871f','hex')
            device.onMessage(data)
            expect(channel.onMessage).toHaveBeenCalled()

        })

        test('Illegal Message - sync char missing',()=>{
            const logger = { logEvent:jest.fn(), log:jest.fn() }
            const channel = new Channel(0,null as any,{})
            channel.onMessage = jest.fn()
            const device = new AntDevice({logger})
            device['channels'] = [ channel]


            const data = Buffer.from('12345678901023a4de','hex')
            device.onMessage(data)
            expect(logger.logEvent).toHaveBeenLastCalledWith(expect.objectContaining({message:'ANT+ RECV ERROR', error:'Illegal message'}))
            expect(channel.onMessage).not.toHaveBeenCalled()
        })

        test('Illegal Message - less than 4 chars',()=>{
            const logger = { logEvent:jest.fn(), log:jest.fn() }
            const channel = new Channel(0,null as any,{})
            channel.onMessage = jest.fn()
            const device = new AntDevice({logger})
            device['channels'] = [ channel]

            const data = Buffer.from('a4de','hex')
            device.onMessage(data)
            expect(logger.logEvent).toHaveBeenLastCalledWith(expect.objectContaining({message:'ANT+ RECV ERROR', error:'Illegal message'}))
            expect(channel.onMessage).not.toHaveBeenCalled()

        })

        test('Valid Message - wrong channel',()=>{
            const logger = { logEvent:jest.fn(), log:jest.fn() }
            const channel = new Channel(0,null as any,{})
            channel.onMessage = jest.fn()
            const device = new AntDevice({logger})
            device['channels'] = [ channel]

            const data = Buffer.from('a4144e0110193ddb00005c35e02e0a110510006800871f','hex')
            device.onMessage(data)
            expect(logger.logEvent).not.toHaveBeenLastCalledWith(expect.objectContaining({message:'ANT+ RECV ERROR'}))
            expect(channel.onMessage).not.toHaveBeenCalled()

        })

    })
})