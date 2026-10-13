import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { startLocalChild, stopLocalChildren } from './localStack'

it.each([
  ['stops a service and its grandchild listener before returning', false],
  ['kills a grandchild listener that ignores graceful shutdown', true],
])('%s', async (_scenario, ignoresTermination) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-child-proof-'))
  const handoff = path.join(directory, 'port')
  const service = `const net = require('node:net'); const fs = require('node:fs'); ${ignoresTermination ? "process.on('SIGTERM', () => {});" : ''} const s = net.createServer(c => c.end('HTTP/1.1 200 OK\\r\\nContent-Length: 5\\r\\nConnection: close\\r\\n\\r\\nalive')); s.listen(0, '127.0.0.1', () => fs.writeFileSync(${JSON.stringify(handoff)}, String(s.address().port)));`
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
    expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe('alive')
    await stopLocalChildren([child])
    await expect(fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) })).rejects.toThrow()
  } finally {
    await stopLocalChildren([child])
    await rm(directory, { recursive: true, force: true })
  }
})
