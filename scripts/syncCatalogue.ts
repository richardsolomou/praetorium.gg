import { execFileSync } from 'node:child_process'
import path from 'node:path'
import pRetry from 'p-retry'
import { catalogueSources } from '../src/server/catalogueSources'
import {
  activateCachedSnapshot,
  catalogueBaseUrl,
  catalogueLock,
  fetchCurrentPointer,
  fetchCurrentSnapshot,
  fetchPinnedSnapshot,
  installedSnapshot,
} from '../src/server/catalogueSnapshot'
import { PRIVATE_CATALOGUE_BASE } from '../src/server/catalogueStore'
import { privateR2Client } from '../src/server/r2Client'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { catalogueCacheRoot } from './lib/catalogueCache'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { loadCatalogueCredentials } from './lib/catalogueCredentials'
import { resolveCatalogueUpstream } from './lib/catalogueUpstream'

const root = path.join(import.meta.dirname, '..')
const dataDirectory = catalogueDataDirectory()

/** A dropped connection fails CI otherwise; downloads are verified by hash, so another attempt is safe. */
const withRetries = <T>(download: () => Promise<T>) =>
  pRetry(download, {
    retries: 2,
    minTimeout: 2_000,
    onFailedAttempt: ({ error, retriesLeft }) => {
      if (retriesLeft > 0) console.log(`Catalogue download failed (${error.message}); retrying`)
    },
  })

const argument = process.argv[2]
if (argument !== '--check' && argument !== '--upstream') loadCatalogueCredentials(root)
if (argument === '--check') {
  readCatalogueComposition(path.join(root, 'catalogue'))
  console.log('catalogue source definitions are well formed')
} else if (argument === '--upstream') {
  const next = await resolveCatalogueUpstream(catalogueSources, readCatalogueComposition(path.join(root, 'catalogue')), console.log)
  if (!next.changed) console.log('all configured source revisions match their approved branches')
} else if (argument === undefined || argument === '--latest' || argument === '--prepare') {
  const base = catalogueBaseUrl()
  const cacheRoot = catalogueCacheRoot('catalogues')
  if (
    argument === '--prepare' &&
    base === PRIVATE_CATALOGUE_BASE &&
    installedSnapshot(cacheRoot ? path.join(cacheRoot, catalogueLock.pointer.id) : dataDirectory)?.id !== catalogueLock.pointer.id &&
    !privateR2Client()
  ) {
    console.log('Building pinned public catalogue sources; snapshot-only historical editions are omitted.')
    execFileSync(process.execPath, ['--import', 'tsx', path.join(root, 'scripts/materializeCatalogue.ts'), '--without-stored-editions'], {
      cwd: root,
      env: { ...process.env, CATALOGUE_DIR: dataDirectory },
      stdio: 'inherit',
    })
  } else if (!cacheRoot) {
    const fetch = argument === '--latest' ? fetchCurrentSnapshot : fetchPinnedSnapshot
    await withRetries(() => fetch(dataDirectory, base, (message) => console.log(message)))
  } else {
    const pointer = argument === '--latest' ? await withRetries(() => fetchCurrentPointer(base)) : catalogueLock.pointer
    const cached = path.join(cacheRoot, pointer.id)
    const fetch = argument === '--latest' ? fetchCurrentSnapshot : fetchPinnedSnapshot
    await withRetries(() => fetch(cached, base, (message) => console.log(message)))
    activateCachedSnapshot(dataDirectory, cached)
    console.log(`catalogue-data -> ${cached}`)
  }
} else {
  throw new Error('expected --prepare, --check, --upstream, --latest, or no argument')
}
