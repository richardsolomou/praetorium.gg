import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { localObjectStore } from '../src/server/localObjectStore'
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

async function fixture(healthy = true, healthDelay = 0) {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-node-handoff-'))
  const publicPort = await reserveLocalPort()
  const internalPort = await reserveLocalPort()
  await mkdir(path.join(directory, 'server'))
  await writeFile(
    path.join(directory, 'server/index.mjs'),
    `
    import { serve } from ${JSON.stringify(srvx)};
    let terminated = false;
    let healthRequests = 0;
    process.on('SIGTERM', () => { terminated = true });
    serve({ port: Number(process.env.NITRO_PORT), hostname: '127.0.0.1', fetch: async request => {
      if (new URL(request.url).pathname === '/slow') {
        console.log('slow request started');
        await new Promise(resolve => setTimeout(resolve, 250));
        return new Response(terminated ? 'application stopped before draining' : 'complete');
      }
      if (new URL(request.url).pathname === '/crash') process.exit(17);
      console.log('health requested');
      if (healthRequests++ === 0) await new Promise(resolve => setTimeout(resolve, ${healthDelay}));
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
      LOCAL_OBJECT_DIR: path.join(directory, 'objects'),
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
  return {
    child,
    waitFor,
    healthRequests: () => [...output.matchAll(/health requested/g)].length,
    origin: `http://127.0.0.1:${publicPort.port}`,
    objects: localObjectStore(path.join(directory, 'objects')),
  }
}

it('waits for a warming health request instead of cancelling it and starting another', async () => {
  const { waitFor, healthRequests } = await fixture(true, 2_500)
  await waitFor('Node server ready')
  expect(healthRequests()).toBe(1)
}, 10_000)

it('cancels a pending readiness request when shutdown begins', async () => {
  const { child, waitFor } = await fixture(true, 60_000)
  await waitFor('health requested')
  const exited = once(child, 'close')
  child.kill('SIGTERM')
  expect((await exited)[0]).toBe(0)
}, 10_000)

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
}, 10_000)

it('stops the public proxy and exits unsuccessfully when the application crashes', async () => {
  const { child, waitFor, origin } = await fixture()
  await waitFor('Node server ready')
  const exited = once(child, 'close')
  await fetch(`${origin}/crash`).catch(() => {})
  expect((await exited)[0]).toBe(1)
})

it('serves a stored catalogue object from local object storage', async () => {
  const { waitFor, origin, objects } = await fixture()
  await objects.put('catalogue/current.json', new TextEncoder().encode('{}'))
  await waitFor('Node server ready')
  const response = await fetch(`${origin}/catalogue/current.json`)
  expect(response.headers.get('x-praetorium-object-source')).toBe('local')
})

it('lets the application serve a catalogue path with no stored object', async () => {
  const { waitFor, origin } = await fixture()
  await waitFor('Node server ready')
  const response = await fetch(`${origin}/catalogue/retired-ids.json?import`)
  expect(await response.text()).toBe('health')
})
