import fs from 'node:fs'
import path from 'node:path'
import { setPriority } from 'node:os'
import { refreshLiveCatalogue } from './lib/liveCatalogue'
import { prepareLiveRevision, readLiveRevisionSources } from './lib/liveCatalogueRefresh'
import { publishLiveCatalogue } from './lib/liveCatalogueArchive'
import { liveCatalogueRevision } from '../src/server/liveCatalogue'

const root = process.env.CATALOGUE_LIVE_DIR
if (!root || !path.isAbsolute(root)) throw new Error('CATALOGUE_LIVE_DIR must be absolute')
const compiler = process.env.CATALOGUE_COMPILER
if (!compiler || !/^[a-f0-9]{64}$/.test(compiler)) throw new Error('CATALOGUE_COMPILER must name the bundled compiler')
const authoring = process.env.CATALOGUE_AUTHORING
if (!authoring || !/^[a-f0-9]{64}$/.test(authoring)) throw new Error('CATALOGUE_AUTHORING must name the bundled catalogue configuration')
const bootstrap = process.argv[2] === '--baseline'
if (process.argv.length > (bootstrap ? 3 : 2)) throw new Error('expected --baseline or no argument')
setPriority(10)
const archiveTarget = process.env.CATALOGUE_LIVE_ARCHIVE
await refreshLiveCatalogue(
  root,
  prepareLiveRevision(root, compiler, { bootstrap, ...(archiveTarget ? { archive: { target: archiveTarget, authoring } } : {}) }),
)

// After activation, so a failed upload never costs a working catalogue.
const live = archiveTarget ? liveCatalogueRevision(root) : null
if (archiveTarget && live) {
  try {
    const { key, from } = readLiveRevisionSources(live.directory)
    const result = await publishLiveCatalogue(
      path.join(live.directory, 'catalogue'),
      archiveTarget,
      { authoring, sources: key },
      from ? { authoring, sources: from } : null,
    )
    // The next compiler falls back to these sources when the archive is unavailable (`retainedCatalogueCache`).
    if (result !== 'superseded') fs.writeFileSync(path.join(path.dirname(root), 'live-sources'), key)
    console.log(`Live catalogue archive ${result}`)
  } catch (error) {
    console.error({ event: 'live_catalogue_archive_failed', error })
  }
}
