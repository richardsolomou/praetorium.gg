import { verifyProductBundle } from './lib/productImport'

const directory = process.argv[2]
if (!directory) throw new Error('usage: pnpm product:verify /absolute/path/product-export-directory')

console.log(JSON.stringify(await verifyProductBundle(directory)))
