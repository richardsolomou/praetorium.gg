import { spawn } from 'node:child_process'
import { createServer, request, type Server } from 'node:http'
import { once } from 'node:events'
import httpProxy from 'http-proxy'
import { expect, it } from 'vitest'
import { nodeLifecycle } from './nodeLifecycle'

function port(server: Server) {
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Server has no TCP address')
  return address.port
}

it('drains a proxied response before signalling the owned application', async () => {
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { createServer } from 'node:http';
    let terminated = false;
    const server = createServer((req, res) => {
      process.stdout.write('request\\n');
      setTimeout(() => res.end(terminated ? 'stopped early' : 'complete'), 100);
    });
    server.listen(0, '127.0.0.1', () => console.log(server.address().port));
    process.on('SIGTERM', () => { terminated = true; server.close(() => process.exit(0)) });
  `,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const [output] = await once(child.stdout, 'data')
  const proxy = httpProxy.createProxyServer({ target: `http://127.0.0.1:${String(output).trim()}` })
  const server = createServer((req, res) => proxy.web(req, res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const lifecycle = nodeLifecycle()
  lifecycle.ownChild(child)
  lifecycle.ownServer(server, proxy)
  try {
    const response = fetch(`http://127.0.0.1:${port(server)}`)
    await once(child.stdout, 'data')
    await lifecycle.stop()
    expect([await (await response).text(), child.exitCode]).toEqual(['complete', 0])
  } finally {
    await lifecycle.stop()
    child.kill('SIGKILL')
  }
})

it('bounds shutdown when HTTP and an upgraded connection never finish', async () => {
  const server = createServer(() => {})
  server.on('upgrade', (_req, socket) => socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n'))
  const lifecycle = nodeLifecycle({ drainMs: 40, childMs: 40 })
  lifecycle.ownServer(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const listeningPort = port(server)
  const pending = request(`http://127.0.0.1:${listeningPort}`)
  pending.on('error', () => {})
  pending.end()
  const upgraded = request(`http://127.0.0.1:${listeningPort}`, { headers: { connection: 'Upgrade', upgrade: 'test' } })
  upgraded.on('error', () => {})
  upgraded.end()
  const [, socket] = await once(upgraded, 'upgrade')
  socket.on('error', () => {})
  await lifecycle.stop()
  expect(server.listening).toBe(false)
  socket.destroy()
})

it('kills a child that ignores termination and cancels startup', async () => {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)"], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  await once(child.stdout, 'data')
  const lifecycle = nodeLifecycle({ drainMs: 40, childMs: 40 })
  lifecycle.ownChild(child)
  await lifecycle.stop()
  expect([lifecycle.signal.aborted, child.signalCode]).toEqual([true, 'SIGKILL'])
})
