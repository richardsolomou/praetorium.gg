import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { publishWorkerCatalogue } from './lib/workerCataloguePublish'

const source = path.resolve(process.env.WORKER_CATALOGUE_OUTPUT_DIR ?? '.output/worker-catalogue')
const destination = path.resolve(process.env.WORKER_CATALOGUE_ASSETS_DIR ?? '.output/public')
const asset = (key: string) => path.join(destination, '_catalogue', key)

await rm(path.join(destination, '_catalogue'), { recursive: true, force: true })
const result = await publishWorkerCatalogue(source, {
  get: async (key) => {
    try {
      return await readFile(asset(key))
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
      throw error
    }
  },
  put: async (key, bytes) => {
    await mkdir(path.dirname(asset(key)), { recursive: true })
    await writeFile(asset(key), bytes)
  },
})
console.log(`worker catalogue assets installed: ${result.snapshotId} ${result.manifestSha256}`)
