import { spawn } from 'node:child_process'
import { open, realpath, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  assertPreviewOverrides,
  assertSavedDevData,
  inspectLocalDevPreview,
  localControlPort,
  readLocalDevPreview,
  type LocalDevPreview,
} from './localDevPreview.ts'

const worktree = await realpath(process.cwd())
const recordFile = path.join(worktree, 'data-dev/active-preview.json')
const logFile = path.join(worktree, 'data-dev/dev.log')
const saved = readLocalDevPreview(recordFile)
if (saved && saved.worktree !== worktree) throw new Error('Preview record belongs to another worktree')
const command = process.argv[2] ?? 'start'
if (!['start', 'status', 'stop', 'restart'].includes(command)) throw new Error('Usage: pnpm dev [start|status|stop|restart]')
const environment: NodeJS.ProcessEnv = { ...process.env, LOCAL_TEST_MODE: 'false' }
for (const name of ['LOCAL_DATA_DIR', 'CATALOGUE_DIR']) if (environment[name]) environment[name] = path.resolve(environment[name])
const controlPort = saved?.controlPort ?? Number(environment.LOCAL_CONTROL_PORT ?? localControlPort(worktree))
let launched: ReturnType<typeof spawn> | undefined
let failedSince = 0
let observedOwner = false
let existing = await inspectLocalDevPreview(worktree, controlPort, saved?.token)

async function stop(preview: LocalDevPreview) {
  const response = await fetch(`http://127.0.0.1:${preview.controlPort}/stop`, {
    method: 'POST',
    headers: { authorization: `Bearer ${preview.token}` },
    signal: AbortSignal.timeout(2_000),
  })
  if (!response.ok) throw new Error('Development runner refused to stop')
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!(await inspectLocalDevPreview(worktree, preview.controlPort, preview.token))) return
    await delay(250)
  }
  throw new Error('Development runner did not finish shutting down')
}

function print(preview: LocalDevPreview) {
  console.log(`${preview.ready ? 'Ready' : 'Starting'}: http://127.0.0.1:${preview.appPort} (Vite, PID ${preview.pid})`)
  console.log(`Data: ${preview.dataDir}\nLog: ${logFile}`)
}

if (command === 'status') {
  if (existing) print(existing)
  else console.log('No development server is running for this worktree')
} else if (command === 'stop') {
  if (existing) await stop(existing)
  console.log('Development server stopped for this worktree')
} else {
  if (command === 'restart' && existing) {
    assertSavedDevData(existing, {
      dataDir: environment.LOCAL_DATA_DIR ?? existing.dataDir,
      appPort: Number(environment.LOCAL_APP_PORT ?? existing.appPort),
      publicUrl:
        environment.LOCAL_PUBLIC_URL ??
        (environment.LOCAL_APP_PORT ? `http://127.0.0.1:${environment.LOCAL_APP_PORT}` : existing.publicUrl),
    })
    await stop(existing)
    existing = undefined
  }
  if (existing) assertPreviewOverrides(existing, environment)
  else {
    await mkdir(path.dirname(logFile), { recursive: true })
    const log = await open(logFile, 'a', 0o600)
    try {
      const child = spawn(process.execPath, ['--import', 'tsx', path.join(worktree, 'scripts/localDev.ts')], {
        cwd: worktree,
        env: environment,
        detached: true,
        stdio: ['ignore', log.fd, log.fd],
      })
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', reject)
      })
      launched = child
      child.unref()
    } finally {
      await log.close()
    }
  }
  const desiredControlPort = command === 'restart' ? Number(environment.LOCAL_CONTROL_PORT ?? controlPort) : controlPort
  for (let attempt = 0; attempt < 600; attempt++) {
    const preview = await inspectLocalDevPreview(worktree, desiredControlPort)
    if (preview) {
      observedOwner = true
      failedSince = 0
      assertPreviewOverrides(preview, environment)
      if (preview.ready) {
        print(preview)
        process.exit(0)
      }
    }
    if (!preview && (observedOwner || (launched && (launched.exitCode !== null || launched.signalCode !== null)))) {
      failedSince ||= Date.now()
      if (Date.now() - failedSince > 3_000) throw new Error(`Development runner exited. Read ${logFile}`)
    }
    await delay(500)
  }
  throw new Error(`Development server did not become ready. Read ${logFile}; the owner is left running for inspection.`)
}
