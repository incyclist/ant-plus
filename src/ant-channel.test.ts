import Channel from './ant-channel'
import { ISensor, IAntDevice } from './types'

describe('Channel', () => {
    describe('stopAllSensors', () => {
        let mockDevice: IAntDevice
        let mockSensor: ISensor

        beforeEach(() => {
            mockDevice = {
                freeChannel: jest.fn(),
                write: jest.fn(),
            } as any

            mockSensor = {
                getChannelConfiguration: jest.fn(() => ({
                    type: 'transmit',
                    transmissionType: 0,
                    timeout: 10,
                    frequency: 57,
                    period: 8192,
                })),
                getDeviceID: jest.fn(() => 123),
                getDeviceType: jest.fn(() => 11),
                setChannel: jest.fn(),
                onMessage: jest.fn(),
                onEvent: jest.fn(),
            } as any
        })

        test('should free channel even when isSensor is false (failed attach)', async () => {
            const channel = new Channel(0, mockDevice, {})

            // Simulate a failed sensor attachment - isSensor stays false but the
            // channel was still allocated and needs to be freed
            channel['isSensor'] = false
            channel['messageQueue'] = []

            // Stop the sensor even though it never fully attached
            await channel.stopAllSensors()

            // Verify freeChannel was still called despite isSensor being false.
            // This is the key fix: before the change, the early return on !isSensor
            // would skip this call, leaking the channel.
            expect(mockDevice.freeChannel).toHaveBeenCalledWith(channel)
        })

        test('should detach attached sensor when stopping', async () => {
            const channel = new Channel(0, mockDevice, {})

            // Set up an attached sensor
            channel['attachedSensor'] = mockSensor
            channel['isSensor'] = true

            // Spy on the detach method
            const detachSpy = jest.spyOn(channel as any, 'detach')

            await channel.stopAllSensors()

            expect(detachSpy).toHaveBeenCalledWith(mockSensor)
            expect(mockDevice.freeChannel).toHaveBeenCalledWith(channel)
        })

        test('should not attempt to detach when no sensor is attached', async () => {
            const channel = new Channel(0, mockDevice, {})

            // Ensure no sensor is attached
            channel['attachedSensor'] = null as any
            channel['isSensor'] = false

            // Spy on the detach method
            const detachSpy = jest.spyOn(channel as any, 'detach')

            await channel.stopAllSensors()

            // Detach should not have been called since attachedSensor is null
            expect(detachSpy).not.toHaveBeenCalled()
            // But freeChannel should still have been called
            expect(mockDevice.freeChannel).toHaveBeenCalledWith(channel)
        })

        test('should always reset isSensor flag to false', async () => {
            const channel = new Channel(0, mockDevice, {})

            channel['isSensor'] = true
            channel['attachedSensor'] = mockSensor

            await channel.stopAllSensors()

            expect(channel['isSensor']).toBe(false)
        })

        test('should always return true', async () => {
            const channel = new Channel(0, mockDevice, {})

            channel['isSensor'] = false
            channel['messageQueue'] = []

            const result = await channel.stopAllSensors()

            expect(result).toBe(true)
        })
    })
})
