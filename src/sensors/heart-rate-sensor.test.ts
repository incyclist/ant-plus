import { IChannel } from "../types"
import { HeartRateSensor } from "./"

const createMockChannel = (channelNo: number) => {
    const channel: IChannel = {
        getChannelNo: () => channelNo,
        getDevice: jest.fn(),
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
    return channel
}

const DEVICE_ID = 58398
const HR_DEVICE_TYPE = 120

// broadcast message (channel 0) with an 8 byte page and the extended part that carries device id and type
const createMessage = (page: number[]) => Buffer.from([
    0xA4, 0x0E, 0x4E, 0x00,
    ...page,
    0x80, DEVICE_ID & 0xFF, DEVICE_ID >> 8, HR_DEVICE_TYPE, 0x00
])

describe('HeartRateSensor', () => {

    describe('page 7 (battery status)', () => {

        // bits 4-6 of the status byte hold the battery status, bits 0-3 the coarse voltage (0x0F: not used)
        const decodeBatteryStatus = (rawStatus: number) => {
            const channel = createMockChannel(0)
            const sensor = new HeartRateSensor(0, channel)

            // the first page is only used to initialize the page state, the next page is decoded
            sensor.onMessage(createMessage([0x00, 0, 0, 0, 0, 0, 0, 0]))
            sensor.onMessage(createMessage([0x07, 0xFF, 0x00, (rawStatus << 4) | 0x0F, 0, 0, 0, 0]))

            const calls = (channel.onDeviceData as jest.Mock).mock.calls
            return calls[calls.length - 1][2].BatteryStatus
        }

        test.each([
            [0, 'Reserved (0)'],
            [1, 'New'],
            [2, 'Good'],
            [3, 'Ok'],
            [4, 'Low'],
            [5, 'Critical'],
            [6, 'Reserved (6)'],
            [7, 'Invalid'],
        ])('raw status %i is reported as %s', (raw, expected) => {
            expect(decodeBatteryStatus(raw)).toBe(expected)
        })
    })
})
