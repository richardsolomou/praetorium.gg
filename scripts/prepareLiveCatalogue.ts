/**
 * `tsx scripts/prepareLiveCatalogue.ts <target>` prepares the target's published live catalogue
 * for this checkout's compiler and shares the result, so the release's new replica downloads its
 * catalogue instead of compiling it before it can serve.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { prepareCatalogueOutputs } from './lib/catalogueOutputs'
import { compilerFingerprint } from './lib/compilerSources'
import { fetchLiveCatalogue } from './lib/liveCatalogueArchive'

const target = process.argv[2]
if (!target || process.argv.length > 3) throw new Error('expected a deployment target')
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-live-catalogue-'))
try {
  const directory = path.join(staging, 'catalogue')
  if (await fetchLiveCatalogue(target, directory)) await prepareCatalogueOutputs(directory, staging, await compilerFingerprint())
  else console.log(`${target} has published no live catalogue; its replicas prepare their own`)
} finally {
  fs.rmSync(staging, { recursive: true, force: true })
}
