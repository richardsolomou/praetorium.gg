import path from 'node:path'
import { installWorkerCatalogueAssets } from './lib/installWorkerCatalogueAssets'

const source = path.resolve(process.env.WORKER_CATALOGUE_OUTPUT_DIR ?? '.output/worker-catalogue')
const destination = path.resolve(process.env.WORKER_CATALOGUE_ASSETS_DIR ?? '.output/public')
const result = await installWorkerCatalogueAssets(source, destination)
console.log(`worker catalogue assets installed: ${result.snapshotId} ${result.manifestSha256}`)
