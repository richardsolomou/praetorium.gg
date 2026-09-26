import { databaseUrl } from '../src/db/connection'
import { exportProductBundle } from './lib/productExport'

const directory = process.argv[2]
if (!directory) throw new Error('usage: pnpm product:export /absolute/path/product-export-directory')

console.log(JSON.stringify(await exportProductBundle(databaseUrl(), directory, process.cwd())))
