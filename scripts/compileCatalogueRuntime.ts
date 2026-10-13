import fs from 'node:fs'
import path from 'node:path'
import { writeCatalogueRuntime } from './lib/catalogueRuntime'

const output = path.resolve(process.env.LOCAL_BUILD_DIR ?? '.output', 'server/catalogue-runtime')
fs.mkdirSync(path.dirname(output), { recursive: true })
writeCatalogueRuntime(process.env.CATALOGUE_DIR ?? path.resolve('catalogue-data'), output)
console.log(`Prepared catalogue runtime at ${output}`)
