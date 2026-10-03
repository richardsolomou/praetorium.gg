import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { build } from 'vite'
import { webSourceMapPlugins } from '../vite.config'

const dockerfile = readFileSync(new URL('../Dockerfile.node', import.meta.url), 'utf8')
const uploadCommand = dockerfile
  .split('RUN --mount=type=secret,id=posthog_api_key,env=POSTHOG_CLI_API_KEY \\\n')[1]!
  .split('\nADD ')[0]!
  .replaceAll('\\\n', ' ')
const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function imageBuild(environment: Record<string, string>, buildExitCode = 37) {
  const directory = mkdtempSync(path.join(tmpdir(), 'praetorium-source-maps-test-'))
  directories.push(directory)
  mkdirSync(path.join(directory, '.output/public/assets'), { recursive: true })
  const map = path.join(directory, '.output/public/assets/app.js.map')
  writeFileSync(map, '{}')
  writeFileSync(path.join(directory, 'pnpm'), `#!/bin/sh\nif [ "$1" = build ]; then exit ${buildExitCode}; fi\nexit 37\n`, { mode: 0o755 })
  const result = spawnSync('sh', ['-c', uploadCommand], {
    cwd: directory,
    env: { PATH: `${directory}:${process.env.PATH}`, ...environment },
    encoding: 'utf8',
  })
  return { result, map }
}

const uploadEnvironment = {
  POSTHOG_UPLOAD_SOURCEMAPS: 'true',
  POSTHOG_CLI_API_KEY: 'test-personal-key',
  POSTHOG_CLI_HOST: 'https://us.posthog.com',
  POSTHOG_CLI_PROJECT_ID: '548119',
  GITHUB_SHA: 'test-revision',
}

test.each(['POSTHOG_CLI_API_KEY', 'POSTHOG_CLI_HOST', 'POSTHOG_CLI_PROJECT_ID', 'GITHUB_SHA'])(
  'stops an upload-enabled image build when %s is missing',
  (variable) => {
    const { result } = imageBuild({ ...uploadEnvironment, [variable]: '' })

    expect({ failed: result.status !== 0, error: result.stderr }).toEqual({
      failed: true,
      error: expect.stringContaining(`${variable}:`),
    })
  },
)

test('stops publication when the browser build fails before source-map cleanup', () => {
  const { result, map } = imageBuild(uploadEnvironment)

  expect({ status: result.status, mapRetained: existsSync(map) }).toEqual({ status: 37, mapRetained: true })
})

test('stops publication when the worker upload fails after the browser build succeeds', () => {
  const { result, map } = imageBuild(uploadEnvironment, 0)

  expect({ status: result.status, mapRetained: existsSync(map) }).toEqual({ status: 37, mapRetained: true })
})

test('removes served source maps from preview images without upload credentials', () => {
  const { result, map } = imageBuild({ POSTHOG_UPLOAD_SOURCEMAPS: 'false' }, 0)

  expect({ status: result.status, mapRetained: existsSync(map) }).toEqual({ status: 0, mapRetained: false })
})

test('changes content-hashed chunk URLs when their injected PostHog IDs change', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'praetorium-source-maps-hash-'))
  directories.push(directory)
  const entry = path.join(directory, 'entry.js')
  writeFileSync(entry, 'export const fail = () => { throw new Error("verification") }')
  const bundle = async () => {
    const output = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: webSourceMapPlugins(uploadEnvironment),
      build: {
        write: false,
        minify: true,
        lib: { entry, formats: ['es'] },
        rolldownOptions: { output: { entryFileNames: '[name]-[hash].js' } },
      },
    })
    const result = Array.isArray(output) ? output[0]! : output
    if (!('output' in result)) throw new Error('Missing bundle output')
    const chunk = result.output.find((item) => item.type === 'chunk')!
    if (chunk.type !== 'chunk') throw new Error('Missing JavaScript chunk')
    return chunk
  }
  const first = await bundle()
  const second = await bundle()

  expect({
    changedUrl: first.fileName !== second.fileName,
    registeredIds: [first, second].map((chunk) => chunk.code.includes('_posthogChunkIds')),
  }).toEqual({ changedUrl: true, registeredIds: [true, true] })
})
