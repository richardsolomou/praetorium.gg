import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'

const fixtures: { directory: string; child: ChildProcess; closed: Promise<unknown> }[] = []

afterEach(async () => {
  for (const { directory, child, closed } of fixtures.splice(0)) {
    if (child.exitCode === null) child.kill('SIGTERM')
    await closed
    await rm(directory, { recursive: true, force: true })
  }
})

async function fixture(cached = false) {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-refresh-output-'))
  const build = path.join(directory, 'build')
  const data = path.join(directory, 'data')
  const release = path.join(directory, 'release')
  await mkdir(path.join(build, 'server'), { recursive: true })
  if (cached) {
    const root = path.join(data, 'catalogues', 'a'.repeat(64))
    await mkdir(root, { recursive: true })
    await writeFile(path.join(root, 'current.json'), JSON.stringify({ id: 'c'.repeat(64) }))
  }
  await writeFile(path.join(build, 'server/catalogue-compiler.json'), JSON.stringify({ key: 'a'.repeat(64), authoring: 'b'.repeat(64) }))
  await writeFile(
    path.join(build, 'server/catalogue-refresh.mjs'),
    `
      import fs from 'node:fs';
      import path from 'node:path';
      if (process.env.CATALOGUE_COMPILER !== 'a'.repeat(64)) throw new Error('The worker needs its compiler');
      if (!process.argv.includes('--baseline') && !${cached}) process.exit(0);
      console.log('Preparing server projections');
      console.error('Catalogue diagnostic');
      await new Promise(resolve => {
        const timer = setInterval(() => {
          if (!fs.existsSync(${JSON.stringify(release)})) return;
          clearInterval(timer);
          resolve();
        }, 10);
      });
      fs.writeFileSync(path.join(process.env.CATALOGUE_LIVE_DIR, 'current.json'), JSON.stringify({ id: 'c'.repeat(64) }));
    `,
  )
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import { startCatalogueRefresh } from ${JSON.stringify(pathToFileURL(path.resolve('scripts/lib/catalogueRefreshProcess.ts')).href)};
        const controller = new AbortController();
        process.on('SIGTERM', () => controller.abort());
        await startCatalogueRefresh(${JSON.stringify(build)}, ${JSON.stringify(data)}, controller.signal, 30 * 60_000);
        console.log('Catalogue ready');
      `,
    ],
    { env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const closed = once(child, 'close')
  fixtures.push({ directory, child, closed })
  const output = { stdout: '', stderr: '' }
  child.stdout.on('data', (chunk) => (output.stdout += chunk))
  child.stderr.on('data', (chunk) => (output.stderr += chunk))
  return { output, finish: () => writeFile(release, ''), closed }
}

it.each([
  ['stdout', 'Preparing server projections'],
  ['stderr', 'Catalogue diagnostic'],
] as const)('streams catalogue %s while preparation is still running', async (stream, message) => {
  const { output, finish, closed } = await fixture()
  await expect.poll(() => output[stream]).toContain(message)
  expect(output.stdout).not.toContain('Catalogue ready')
  await finish()
  await closed
  expect(output[stream].split(message)).toHaveLength(2)
})

it('serves a retained catalogue while the update worker is still running', async () => {
  const { output, finish, closed } = await fixture(true)
  await expect.poll(() => output.stdout).toContain('Preparing server projections')
  expect(output.stdout).toContain('Catalogue ready')
  await finish()
  await closed
})
