import fs from 'node:fs'
import path from 'node:path'
import { writeCatalogueRuntime } from './lib/catalogueRuntime'
import { installPublishedRuntime } from './lib/catalogueRuntimeDistribution'

const output = path.resolve(process.env.LOCAL_BUILD_DIR ?? '.output', 'server/catalogue-runtime')
fs.mkdirSync(path.dirname(output), { recursive: true })
const directory = process.env.CATALOGUE_DIR ?? path.resolve('catalogue-data')
if (!(await installPublishedRuntime(directory, output))) writeCatalogueRuntime(directory, output)
console.log(`Prepared catalogue runtime at ${output}`)
