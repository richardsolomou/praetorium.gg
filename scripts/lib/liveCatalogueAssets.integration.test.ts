import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer, type Server } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { serveLiveCatalogueAsset } from './liveCatalogueAssets'
import { refreshLiveCatalogue } from './liveCatalogue'

const fixtures: { root: string; server: Server }[] = []
afterEach(async () => {
  for (const { root, server } of fixtures.splice(0)) {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    fs.rmSync(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-live-assets-'))
  const root = path.join(directory, 'c'.repeat(64))
  const server = createServer((request, response) => {
    if (!serveLiveCatalogueAsset(request, response, root)) response.end('application')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  fixtures.push({ root: directory, server })
  const publish = (id: string) =>
    refreshLiveCatalogue(root, async (staging) => {
      for (const file of [
        'catalogue/revision.json',
        'runtime/manifest.json',
        'public/offline-reference-version.json',
        `public/assets/reference-${id}.bin`,
      ]) {
        const target = path.join(staging, file)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, JSON.stringify({ id }))
      }
      return id
    })
  return { root, origin, publish }
}

it('serves the new manifest and retains old assets across a runtime update without restarting', async () => {
  const { root, origin, publish } = await fixture()
  const first = 'a'.repeat(64)
  const second = 'b'.repeat(64)
  await publish(first)
  const before = await (await fetch(`${origin}/offline-reference-version.json`)).json()
  await publish(second)
  const current = await fetch(`${origin}/offline-reference-version.json`)
  const oldAsset = await fetch(`${origin}/catalogue-assets/${path.basename(root)}/reference-${first}.bin`)
  const newAsset = await fetch(`${origin}/catalogue-assets/${path.basename(root)}/reference-${second}.bin`)

  expect({
    before,
    after: await current.json(),
    cache: current.headers.get('cache-control'),
    old: await oldAsset.json(),
    latest: await newAsset.json(),
  }).toEqual({
    before: { id: first },
    after: { id: second },
    cache: 'no-store',
    old: { id: first },
    latest: { id: second },
  })
})

it('refuses requests outside the public catalogue asset inventory', async () => {
  const { origin, publish } = await fixture()
  await publish('a'.repeat(64))

  expect((await fetch(`${origin}/catalogue-assets/..%2fcatalogue%2frevision.json`)).status).not.toBe(200)
})

it('serves retained downloads from another compiler namespace during a rolling deployment', async () => {
  const { root, origin } = await fixture()
  const compiler = 'd'.repeat(64)
  const revision = 'a'.repeat(64)
  const directory = path.join(path.dirname(root), compiler, 'assets')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, `reference-${revision}.bin`), 'retained download')

  expect(await (await fetch(`${origin}/catalogue-assets/${compiler}/reference-${revision}.bin`)).text()).toBe('retained download')
})

it('leaves application assets to the application server', async () => {
  const { origin } = await fixture()

  expect(await (await fetch(`${origin}/assets/application.js`)).text()).toBe('application')
})
