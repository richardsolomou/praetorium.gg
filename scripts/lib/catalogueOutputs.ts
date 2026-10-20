import fs from 'node:fs'
import path from 'node:path'
import { readCatalogueRuntime } from '../../src/server/catalogueRuntime'
import { prepareCatalogueRuntime, runtimeCacheKey } from './catalogueRuntimeCache'
import { writeReferenceBundle } from './offlineReferenceBundle'
import { prepareReferenceBundle, referenceBundleKey } from './offlineReferenceCache'

/** Prepares the server projections and browser downloads for `directory` under `staging`, from the shared store when it holds them. */
export async function prepareCatalogueOutputs(directory: string, staging: string, compiler: string) {
  const runtime = path.join(staging, 'runtime')
  const runtimeKey = runtimeCacheKey(directory, compiler)
  console.log(`Preparing server projections ${runtimeKey}`)
  console.log(`Server projections ${await prepareCatalogueRuntime(directory, runtime, null, runtimeKey)}`)
  const compiled = readCatalogueRuntime(directory, runtime)
  compiled.read('startup')
  const publicDirectory = path.join(staging, 'public')
  fs.mkdirSync(path.join(publicDirectory, 'assets'), { recursive: true })
  console.log('Preparing browser downloads')
  const downloads = await prepareReferenceBundle(
    publicDirectory,
    referenceBundleKey(directory, runtimeKey),
    directory,
    null,
    (output, source) => writeReferenceBundle(output, source, compiled),
  )
  console.log(`Browser downloads ${downloads}`)
  return publicDirectory
}
