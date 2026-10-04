import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { reserveLocalPort } from './lib/localStack'

const require = createRequire(import.meta.url)
const srvx = pathToFileURL(createRequire(require.resolve('nitro')).resolve('srvx')).href
const fixtures: { directory: string; child: ChildProcess }[] = []
afterEach(async () => {
  for (const { child, directory } of fixtures.splice(0)) {
    try {
      process.kill(-child.pid!, 'SIGKILL')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
    await rm(directory, { recursive: true, force: true })
  }
})

async function fixture(healthy = true) {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-node-handoff-'))
  const publicPort = await reserveLocalPort()
  const internalPort = await reserveLocalPort()
  await mkdir(path.join(directory, 'server'))
  await writeFile(
    path.join(directory, 'server/index.mjs'),
    `
    import { serve } from ${JSON.stringify(srvx)};
    let terminated = false;
    process.on('SIGTERM', () => { terminated = true });
    serve({ port: Number(process.env.NITRO_PORT), hostname: '127.0.0.1', fetch: async request => {
      if (new URL(request.url).pathname === '/slow') {
        console.log('slow request started');
        await new Promise(resolve => setTimeout(resolve, 250));
        return new Response(terminated ? 'application stopped before draining' : 'complete');
      }
      if (new URL(request.url).pathname === '/crash') process.exit(17);
      console.log('health requested');
      return new Response('health', {status: ${healthy ? 200 : 503}});
    } });
  `,
  )
  await publicPort.release()
  await internalPort.release()
  const child = spawn(process.execPath, ['scripts/nodeServer.ts'], {
    detached: true,
    env: {
      PATH: process.env.PATH,
      PORT: String(publicPort.port),
      NODE_INTERNAL_PORT: String(internalPort.port),
      LOCAL_BUILD_DIR: directory,
      AUTH_SQLITE_PATH: path.join(directory, 'auth.sqlite'),
      AUTH_INITIALIZE_EMPTY: 'true',
      PRAETORIUM_LOCAL_DEV: 'true',
      LOCAL_TEST_MODE: 'true',
      SPACETIME_DATABASE: 'test',
      SPACETIME_URL: 'http://127.0.0.1:1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  fixtures.push({ directory, child })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  const waitFor = async (text: string) => {
    while (!output.includes(text)) {
      await Promise.race([
        once(child.stdout, 'data'),
        once(child, 'close').then(() => {
          throw new Error(`Node server exited: ${output}`)
        }),
      ])
    }
  }
  return { child, waitFor, origin: `http://127.0.0.1:${publicPort.port}` }
}

it('completes an HTTP request and exits cleanly after SIGTERM with Nitro’s real signal handler', async () => {
  const { child, waitFor, origin } = await fixture()
  await waitFor('Node server ready')
  const response = fetch(`${origin}/slow`)
  await waitFor('slow request started')
  const exited = once(child, 'close')
  child.kill('SIGTERM')
  const body = await (await response).text()
  expect([body, (await exited)[0]]).toEqual(['complete', 0])
})

it('cancels warming without ever opening the public listener', async () => {
  const { child, waitFor, origin } = await fixture(false)
  await waitFor('health requested')
  const exited = once(child, 'close')
  child.kill('SIGTERM')
  expect((await exited)[0]).toBe(0)
  await expect(fetch(origin)).rejects.toThrow()
})

it('stops the public proxy and exits unsuccessfully when the application crashes', async () => {
  const { child, waitFor, origin } = await fixture()
  await waitFor('Node server ready')
  const exited = once(child, 'close')
  await fetch(`${origin}/crash`).catch(() => {})
  expect((await exited)[0]).toBe(1)
})
