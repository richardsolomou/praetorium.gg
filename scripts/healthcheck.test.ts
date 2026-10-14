import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, test } from 'vitest'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

async function serve(status: number) {
  const server = createServer((request, response) => {
    response.statusCode = request.url === '/api/health' ? status : 404
    response.end()
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

function check(port: number) {
  return new Promise<number | null>((resolve) => {
    spawn(process.execPath, ['scripts/healthcheck.ts'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' }).on(
      'exit',
      resolve,
    )
  })
}

test('reports a ready server as healthy', async () => {
  expect(await check(await serve(200))).toBe(0)
})

test('reports a server that is still warming as unhealthy', async () => {
  expect(await check(await serve(503))).toBe(1)
})

test('reports a server that refuses connections as unhealthy', async () => {
  const port = await serve(200)
  await new Promise((resolve) => servers.pop()!.close(resolve))

  expect(await check(port)).toBe(1)
})
