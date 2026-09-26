import { importProductBundle } from './lib/productImport'

const [directory, url, database] = process.argv.slice(2)
if (!directory || !url || !database) {
  throw new Error('usage: pnpm product:import /absolute/path/product-export-directory https://spacetime.example database-name')
}

const clientId = process.env.SPACETIME_ACCESS_CLIENT_ID
const clientSecret = process.env.SPACETIME_ACCESS_CLIENT_SECRET
if (Boolean(clientId) !== Boolean(clientSecret)) throw new Error('Both SpacetimeDB Access credentials are required')

console.log(
  JSON.stringify(
    await importProductBundle(
      directory,
      url,
      database,
      process.env.SPACETIME_IMPORT_TOKEN ?? '',
      clientId && clientSecret ? { clientId, clientSecret } : undefined,
    ),
  ),
)
