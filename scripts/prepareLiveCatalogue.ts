/**
 * `tsx scripts/prepareLiveCatalogue.ts <target> [--publish]` follows upstream from the target's published live
 * catalogue, as a replica's refresh does, and prepares the result for this checkout's compiler, so the release's new
 * replica downloads its catalogue instead of compiling it. With `--publish`, which only releases pass, it publishes
 * the refreshed catalogue for the replica to start from.
 *
 * `tsx scripts/prepareLiveCatalogue.ts --pinned` prepares the pinned snapshot, which a replica starts from when the
 * live catalogue is unavailable.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { catalogueBaseUrl, fetchPinnedSnapshot } from '../src/server/catalogueSnapshot'
import { liveCatalogueRevision } from '../src/server/liveCatalogue'
import { prepareCatalogueOutputs } from './lib/catalogueOutputs'
import { catalogueAuthoring, compilerFingerprint } from './lib/compilerSources'
import { refreshLiveCatalogue } from './lib/liveCatalogue'
import { fetchLiveCatalogue, publishLiveCatalogue } from './lib/liveCatalogueArchive'
import { liveRevisionId, prepareLiveRevision, readLiveRevisionSources } from './lib/liveCatalogueRefresh'

const [target, flag, ...rest] = process.argv.slice(2)
if (!target || rest.length || (flag !== undefined && (flag !== '--publish' || target === '--pinned')))
  throw new Error('expected a deployment target, optionally with --publish, or --pinned')
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-live-catalogue-'))
try {
  const compiler = await compilerFingerprint()
  if (target === '--pinned') {
    const directory = path.join(staging, 'catalogue')
    await fetchPinnedSnapshot(directory, catalogueBaseUrl(), console.log)
    await prepareCatalogueOutputs(directory, staging, compiler)
  } else {
    const authoring = catalogueAuthoring()
    const root = path.join(staging, compiler)
    const download = path.join(staging, 'published')
    const published = await fetchLiveCatalogue(target, path.join(download, 'catalogue'), authoring)
    if (published?.authoring === authoring) {
      // Laid out as a replica's live revision, so the refresh starts from it.
      const id = liveRevisionId(null, published.sources)
      fs.mkdirSync(root)
      fs.writeFileSync(path.join(download, 'sources.json'), JSON.stringify({ key: published.sources }))
      fs.renameSync(download, path.join(root, id))
      fs.writeFileSync(path.join(root, 'current.json'), JSON.stringify({ id }))
    } else console.log(`${target} has published no live catalogue for this configuration; starting from the pinned snapshot`)
    const changed = await refreshLiveCatalogue(root, prepareLiveRevision(root, compiler))
    const live = liveCatalogueRevision(root)
    if (!live) throw new Error('No live catalogue was prepared')
    const directory = path.join(live.directory, 'catalogue')
    if (!changed) await prepareCatalogueOutputs(directory, path.join(staging, 'outputs'), compiler)
    else if (flag === '--publish') {
      const { key } = readLiveRevisionSources(live.directory)
      console.log(`Live catalogue archive ${await publishLiveCatalogue(directory, target, { authoring, sources: key }, published)}`)
    }
  }
} finally {
  fs.rmSync(staging, { recursive: true, force: true })
}
