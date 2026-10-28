import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { liveCatalogueRevision } from '../../src/server/liveCatalogue.ts'
import { holdCatalogueCache, retainedCatalogueCache, pruneCatalogueCaches } from './catalogueCacheLease.ts'

const execute = promisify(execFile)

/** Resolves once a first catalogue is live, failing after `firstCatalogueMs`; later refreshes continue in the background. */
export async function startCatalogueRefresh(buildDirectory: string, dataDirectory: string, signal: AbortSignal, firstCatalogueMs: number) {
  const { key, authoring } = JSON.parse(fs.readFileSync(path.join(buildDirectory, 'server/catalogue-compiler.json'), 'utf8')) as {
    key: string
    authoring: string
  }
  if (![key, authoring].every((value) => /^[a-f0-9]{64}$/.test(value))) throw new Error('Invalid catalogue compiler key')
  const root = path.join(dataDirectory, 'catalogues', key)
  const stopLease = holdCatalogueCache(root, signal)
  fs.writeFileSync(path.join(root, 'authoring'), authoring)
  const retained = process.env.CATALOGUE_DIR ? null : retainedCatalogueCache(root, authoring)
  const stopRetainedLease = retained ? holdCatalogueCache(retained.root, signal) : () => {}
  let running = false
  const refresh = async (timeoutMs = 25 * 60_000) => {
    if (running || signal.aborted) return
    running = true
    try {
      const execution = execute(
        process.execPath,
        [path.join(buildDirectory, 'server/catalogue-refresh.mjs'), ...(!liveCatalogueRevision(root) ? ['--baseline'] : [])],
        {
          env: {
            ...process.env,
            CATALOGUE_LIVE_DIR: root,
            CATALOGUE_COMPILER: key,
            CATALOGUE_AUTHORING: authoring,
            CATALOGUE_DIR: process.env.CATALOGUE_DIR ?? retained?.directory,
          },
          signal,
          timeout: timeoutMs,
          killSignal: 'SIGKILL',
          maxBuffer: 4_000_000,
        },
      )
      execution.child.stdout?.pipe(process.stdout)
      execution.child.stderr?.pipe(process.stderr)
      await execution
    } catch (error) {
      if (signal.aborted) return
      if (!liveCatalogueRevision(root)) throw error
      console.error({ event: 'catalogue_refresh_failed', error })
    } finally {
      running = false
      if (!signal.aborted) {
        try {
          pruneCatalogueCaches(root)
        } catch (error) {
          console.error({ event: 'catalogue_cache_cleanup_failed', error })
        }
      }
    }
  }
  try {
    if (!liveCatalogueRevision(root)) {
      const deadline = Date.now() + firstCatalogueMs
      do {
        signal.throwIfAborted()
        await refresh(Math.max(1, Math.min(25 * 60_000, deadline - Date.now())))
        if (liveCatalogueRevision(root)) break
        if (Date.now() > deadline) throw new Error('Timed out waiting for the first catalogue')
        await delay(10_000, undefined, { signal })
      } while (!signal.aborted)
    }
  } catch (error) {
    stopLease()
    throw error
  } finally {
    stopRetainedLease()
  }
  const timer = setInterval(() => void refresh(), 60 * 60_000)
  timer.unref()
  signal.addEventListener('abort', () => clearInterval(timer), { once: true })
  void refresh()
  return root
}
