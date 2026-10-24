/**
 * `tsx scripts/prepareLiveCatalogue.ts <target>` prepares the target's published live catalogue
 * for this checkout's compiler and shares the result, so the release's new replica downloads its
 * catalogue instead of compiling it before it can serve.
 *
 * `tsx scripts/prepareLiveCatalogue.ts --pinned` does the same for the pinned snapshot, which a
 * replica on a new compiler prepares first, before it refreshes to the live catalogue.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { catalogueBaseUrl, fetchPinnedSnapshot } from '../src/server/catalogueSnapshot'
import { prepareCatalogueOutputs } from './lib/catalogueOutputs'
import { compilerFingerprint } from './lib/compilerSources'
import { fetchLiveCatalogue } from './lib/liveCatalogueArchive'

const target = process.argv[2]
if (!target || process.argv.length > 3) throw new Error('expected a deployment target or --pinned')
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-live-catalogue-'))
try {
  const directory = path.join(staging, 'catalogue')
  if (target === '--pinned') {
    await fetchPinnedSnapshot(directory, catalogueBaseUrl(), console.log)
    await prepareCatalogueOutputs(directory, staging, await compilerFingerprint())
  } else if (await fetchLiveCatalogue(target, directory)) await prepareCatalogueOutputs(directory, staging, await compilerFingerprint())
  else console.log(`${target} has published no live catalogue; its replicas prepare their own`)
} finally {
  fs.rmSync(staging, { recursive: true, force: true })
}
