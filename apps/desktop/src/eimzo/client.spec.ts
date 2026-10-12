import { afterEach, describe, expect, it } from 'vitest'
import { type AddressInfo, WebSocket, WebSocketServer } from 'ws'
import { createEimzoClient } from './client.js'

const cert = {
  disk: '/keys/',
  path: '',
  name: 'DS300000001',
  alias: 'o=alfa savdo mchj,1.2.860.3.16.1.1=300000001,validfrom=2026.01.21 12:04:52,validto=2028.01.21 12:04:52',
}

let server: WebSocketServer | undefined
const received: unknown[] = []

/** A fake local E-IMZO: answers each request with `reply(request)`. */
async function fakeEimzo(reply: (request: { plugin?: string; name?: string }) => unknown): Promise<string> {
  server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  server.on('connection', (socket) => {
    socket.on('message', (data) => {
      const request = JSON.parse(String(data))
      received.push(request)
      socket.send(JSON.stringify(reply(request)))
    })
  })
  await new Promise((ok) => server!.once('listening', ok))
  return `ws://127.0.0.1:${(server.address() as AddressInfo).port}/service/cryptapi`
}

afterEach(async () => {
  received.length = 0
  server?.clients.forEach((c) => c.terminate())
  await new Promise((ok) => (server ? server.close(ok) : ok(undefined)))
  server = undefined
})

describe('E-IMZO client', () => {
  it('lists the certificates E-IMZO knows about', async () => {
    const url = await fakeEimzo(() => ({ success: true, certificates: [cert] }))

    const certs = await createEimzoClient({ url, WebSocket }).listCertificates()

    expect(certs).toEqual([cert])
    expect(received).toEqual([{ plugin: 'pfx', name: 'list_all_certificates' }])
  })

  it('says E-IMZO is not running when nothing listens on its port', async () => {
    const url = await fakeEimzo(() => ({}))
    await new Promise((ok) => server!.close(ok))
    server = undefined

    await expect(createEimzoClient({ url, WebSocket }).listCertificates()).rejects.toMatchObject({
      code: 'EIMZO_NOT_RUNNING',
    })
  })

  it('gives up when E-IMZO accepts the connection but never answers', async () => {
    server = new WebSocketServer({ port: 0, host: '127.0.0.1' }) // accepts, stays silent
    await new Promise((ok) => server!.once('listening', ok))
    const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/service/cryptapi`

    await expect(createEimzoClient({ url, WebSocket, timeoutMs: 100 }).listCertificates()).rejects.toMatchObject({
      code: 'EIMZO_TIMEOUT',
    })
  })

  it('surfaces a refusal from E-IMZO instead of pretending there are no keys', async () => {
    const url = await fakeEimzo(() => ({ success: false, reason: 'Disk topilmadi' }))

    await expect(createEimzoClient({ url, WebSocket }).listCertificates()).rejects.toMatchObject({
      code: 'EIMZO_ERROR',
      message: expect.stringContaining('Disk topilmadi'),
    })
  })

  it('rejects a reply that is not JSON instead of throwing in the main process', async () => {
    server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
    server.on('connection', (socket) => socket.on('message', () => socket.send('not json')))
    await new Promise((ok) => server!.once('listening', ok))
    const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/service/cryptapi`

    await expect(createEimzoClient({ url, WebSocket, timeoutMs: 2000 }).listCertificates()).rejects.toMatchObject({
      code: 'EIMZO_ERROR',
    })
  })

  it('reports a dropped connection as an E-IMZO error, not a raw socket error', async () => {
    server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
    server.on('connection', (socket) => socket.on('message', () => socket.terminate()))
    await new Promise((ok) => server!.once('listening', ok))
    const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/service/cryptapi`

    await expect(createEimzoClient({ url, WebSocket, timeoutMs: 2000 }).listCertificates()).rejects.toMatchObject({
      code: 'EIMZO_ERROR',
    })
  })
})
