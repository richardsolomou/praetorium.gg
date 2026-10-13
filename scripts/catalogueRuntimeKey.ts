import path from 'node:path'
import { catalogueRuntimeFingerprint } from '../src/server/catalogueRuntime'

console.log(catalogueRuntimeFingerprint(process.env.CATALOGUE_DIR ?? path.resolve('catalogue-data')))
