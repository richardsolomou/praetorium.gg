import { fileURLToPath } from 'node:url'
import { verifyAuthBundle } from './lib/verifyAuthBundle'

const directory = process.argv[2]
if (!directory) throw new Error('usage: pnpm auth:verify /absolute/path/auth-export-directory')

const migrations = fileURLToPath(new URL('../drizzle-auth/', import.meta.url))
console.log(JSON.stringify(await verifyAuthBundle(directory, migrations)))
