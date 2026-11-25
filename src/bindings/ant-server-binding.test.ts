import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import AntServerBinding from './ant-server-binding'

type FakeServer = EventEmitter & {
    stdin: { write: jest.Mock, on: jest.Mock }
    stdout: PassThrough
    kill: jest.Mock
}

// answers requests like the real server does, unless told otherwise
const createFakeServer = (props: { answer?: boolean } = {}): FakeServer => {
    const { answer = true } = props
    const server = new EventEmitter() as FakeServer
    server.stdout = new PassThrough()
    server.kill = jest.fn()
    server.stdin = {
        on: jest.fn(),
        write: jest.fn((line: string) => {
            const match = /^request\/(\d+)\/(\w+)/.exec(line)
            if (answer && match)
                server.stdout.write(`response/${match[1]}/\n`)
            return true
        })
    }
    return server
}

class TestBinding extends AntServerBinding {
    servers: FakeServer[] = []
    nextServer: () => FakeServer = () => createFakeServer()

    protected launchServer(_path) {
        const server = this.nextServer()
        this.servers.push(server)
        return server as any
    }
    hasServer() { return !!this.server }
    pendingRequests() { return Object.keys(this.requests).length }
}

describe('AntServerBinding', () => {

    let logger
    const create = () => new TestBinding({ logger })

    beforeEach(() => {
        logger = { logEvent: jest.fn() }
    })

    describe('close()', () => {

        test('server confirms the request with an empty payload: server is stopped and close is confirmed', async () => {
            const binding = create()
            await binding.startServer()

            const closed = await binding.close()

            expect(closed).toBe(true)
            expect(binding.servers[0].kill).toHaveBeenCalledTimes(1)
            expect(binding.hasServer()).toBe(false)
            expect(logger.logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'stopping ANT+ Server', closeConfirmed: true }))
        })

        test('server does not answer: server is stopped after the timeout and close is not confirmed', async () => {
            jest.useFakeTimers()
            try {
                const binding = create()
                binding.nextServer = () => createFakeServer({ answer: false })
                await binding.startServer()

                const promise = binding.close()
                expect(binding.servers[0].kill).not.toHaveBeenCalled()

                await jest.advanceTimersByTimeAsync(800)
                const closed = await promise

                expect(closed).toBe(false)
                expect(binding.servers[0].kill).toHaveBeenCalledTimes(1)
                expect(binding.hasServer()).toBe(false)
                expect(binding.pendingRequests()).toBe(0)
                expect(logger.logEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'stopping ANT+ Server', closeConfirmed: false }))
            }
            finally {
                jest.useRealTimers()
            }
        })

        test('request cannot be written: server is stopped and close is not confirmed', async () => {
            const binding = create()
            binding.nextServer = () => {
                const server = createFakeServer()
                server.stdin.write.mockImplementation(() => { throw new Error('EPIPE') })
                return server
            }
            await binding.startServer()

            const closed = await binding.close()

            expect(closed).toBe(false)
            expect(binding.servers[0].kill).toHaveBeenCalledTimes(1)
            expect(binding.hasServer()).toBe(false)
        })

        test('second close does nothing', async () => {
            const binding = create()
            await binding.startServer()
            await binding.close()

            const closed = await binding.close()

            expect(closed).toBe(false)
            expect(binding.servers[0].kill).toHaveBeenCalledTimes(1)
        })

        test('no server was started: nothing to stop', async () => {
            const binding = create()

            expect(await binding.close()).toBe(false)
            expect(binding.servers).toHaveLength(0)
        })

        test('a new server is started after the previous one was closed', async () => {
            const binding = create()
            await binding.startServer()
            await binding.close()

            await binding.startServer()

            expect(binding.servers).toHaveLength(2)
            expect(binding.servers[0].kill).toHaveBeenCalledTimes(1)
            expect(binding.servers[1].kill).not.toHaveBeenCalled()
            expect(binding.hasServer()).toBe(true)
        })
    })

    describe('open()', () => {

        test('server could not open the stick: server is stopped before open() returns and a retry starts a new server', async () => {
            const binding = create()
            // the fake server answers every request with an empty payload, which is not the "true" that a successful open sends

            const opened = await binding.open()

            expect(opened).toBe(false)
            expect(binding.servers[0].kill).toHaveBeenCalledTimes(1)
            expect(binding.hasServer()).toBe(false)

            await binding.open()

            expect(binding.servers).toHaveLength(2)
            expect(binding.servers[0].kill).toHaveBeenCalledTimes(1)
        })
    })

    describe('stopServer()', () => {

        test('requests that are still waiting are rejected', async () => {
            const binding = create()
            binding.nextServer = () => createFakeServer({ answer: false })
            await binding.startServer()
            const request = binding.sendRequest('open', 0)
            expect(binding.pendingRequests()).toBe(1)

            binding.stopServer()

            await expect(request).rejects.toThrow('ANT+ Server stopped')
            expect(binding.pendingRequests()).toBe(0)
        })

        test('output of a stopped server is not processed any more', async () => {
            const binding = create()
            const onMessage = jest.spyOn(binding as any, 'onServerMessage')
            await binding.startServer()
            const server = binding.servers[0]

            binding.stopServer()
            server.stdout.write('message/a4\n')
            await new Promise(resolve => setImmediate(resolve))

            expect(onMessage).not.toHaveBeenCalled()
        })

        test('answered requests are removed from the list of pending requests', async () => {
            const binding = create()
            await binding.startServer()

            await binding.sendRequest('close')

            expect(binding.pendingRequests()).toBe(0)
        })
    })
})
