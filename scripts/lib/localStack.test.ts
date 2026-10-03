import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { localTestEnvironment, reserveLocalPort, startLocalChild, stopLocalChildren } from './localStack'

it('allocates distinct ports and data directories for concurrent browser runs', async () => {
  const runs = await Promise.all([localTestEnvironment('e2e', {}), localTestEnvironment('e2e', {})])
  const values = runs.flatMap((run) =>
    Object.entries(run)
      .filter(([name]) => name.endsWith('PORT'))
      .map(([, value]) => value),
  )
  expect([new Set(values).size, new Set(runs.map((run) => run.PLAYWRIGHT_DATA_ROOT)).size]).toEqual([8, 2])
})

it('refuses an occupied explicit port without claiming the service on it', async () => {
  const owner = await reserveLocalPort()
  try {
    await expect(localTestEnvironment('e2e', { PLAYWRIGHT_PORT: String(owner.port) })).rejects.toThrow('unavailable')
  } finally {
    await owner.release()
  }
})

it('chooses an available default when the preferred development port is occupied', async () => {
  const owner = await reserveLocalPort()
  let fallback: Awaited<ReturnType<typeof reserveLocalPort>> | undefined
  try {
    fallback = await reserveLocalPort(owner.port, true)
    expect(fallback.port).not.toBe(owner.port)
  } finally {
    await fallback?.release()
    await owner.release()
  }
})

it('stops a service and its grandchild listener before returning', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-child-proof-'))
  const handoff = path.join(directory, 'port')
  const service = `const net = require('node:net'); const fs = require('node:fs'); const s = net.createServer(c => c.end('alive')); s.listen(0, '127.0.0.1', () => fs.writeFileSync(${JSON.stringify(handoff)}, String(s.address().port)));`
  const parent = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(service)}], {stdio:'inherit'}); setInterval(() => {}, 1000);`
  const child = startLocalChild(process.execPath, ['-e', parent], process.env)
  try {
    let port = ''
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        port = await readFile(handoff, 'utf8')
        break
      } catch {
        await delay(20)
      }
    }
    if (!port) throw new Error('Grandchild listener did not start')
    await stopLocalChildren([child])
    await expect(fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) })).rejects.toThrow()
  } finally {
    await stopLocalChildren([child])
    await rm(directory, { recursive: true, force: true })
  }
})
