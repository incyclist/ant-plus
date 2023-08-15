import { BosDescriptor, Capability, ConfigDescriptor, Device, DeviceDescriptor, Interface, LibUSBException } from 'usb'
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

    describe('open',()=>{

        const usbMock= {}
        class MockedAntDeviceSuccess extends AntDevice {

            protected getDevices(): { device: Device; inUse: boolean }[] {
                return [ {inUse:false,device: usbMock as Device}]
            }
            protected markAsUsed(deviceNo: number): void {
                return
            }
            async openUSBDevice(device: Device): Promise<boolean> {
                return true
            }
            async startup(timeout?: number | undefined): Promise<boolean> {
                return true
            }
        }



        test ('success with detailedReporting',async ()=>{

            const logger = { logEvent:jest.fn(), log:jest.fn() }
            const channel = new Channel(0,null as any,{})
            channel.onMessage = jest.fn()
            const device = new MockedAntDeviceSuccess({logger,detailedStartReport:true})
            const res = await  device.open()
            expect(res).toBe('Success')

        })
        test ('success without detailedReporting',async ()=>{
            const logger = { logEvent:jest.fn(), log:jest.fn() }
            const channel = new Channel(0,null as any,{})
            channel.onMessage = jest.fn()
            const device = new MockedAntDeviceSuccess({logger})
            const res = await  device.open()
            expect(res).toBe(true)
            
        })
        test ('no stick with detailedReporting',async ()=>{

            class MockedDevice extends AntDevice {
                protected getDevices(): { device: Device; inUse: boolean }[] {
                    return []
                }
            }

            const logger = { logEvent:jest.fn(), log:jest.fn() }
            const channel = new Channel(0,null as any,{})
            channel.onMessage = jest.fn()
            const device = new MockedDevice({logger,detailedStartReport:true})
            const res = await  device.open()
            expect(res).toBe('NoStick')
            

        })
        test ('no stick without detailedReporting',async ()=>{
            class MockedDevice extends AntDevice {
                protected getDevices(): { device: Device; inUse: boolean }[] {
                    return []
                }
            }

            const logger = { logEvent:jest.fn(), log:jest.fn() }
            const channel = new Channel(0,null as any,{})
            channel.onMessage = jest.fn()
            const device = new MockedDevice({logger})
            const res = await  device.open()
            expect(res).toBe(false)
            
        })
    })

})