import path from 'node:path'
import { catalogueBaseUrl, fetchSnapshot } from '../src/server/catalogueSnapshot'
import { readPreviewCatalogueLock } from './lib/previewCatalogueAssets'

const directory = process.argv[2]
if (!directory) throw new Error('Preview artifact directory is required')
const lock = await readPreviewCatalogueLock(path.resolve(directory))
await fetchSnapshot(path.resolve('catalogue-data'), catalogueBaseUrl(), lock.pointer, console.log, {
  revisions: lock.revisions,
})
