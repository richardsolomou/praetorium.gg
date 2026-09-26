import { exportSpacetimeProductBundle } from './lib/productExport'

const [url, database, destination] = process.argv.slice(2)
if (!url || !database || !destination) {
  throw new Error('usage: pnpm product:export:spacetime https://spacetime.example database-name /absolute/path/product-export-directory')
}

const clientId = process.env.SPACETIME_ACCESS_CLIENT_ID
const clientSecret = process.env.SPACETIME_ACCESS_CLIENT_SECRET
if (Boolean(clientId) !== Boolean(clientSecret)) throw new Error('Both SpacetimeDB Access credentials are required')

console.log(
  JSON.stringify(
    await exportSpacetimeProductBundle(
      url,
      database,
      process.env.SPACETIME_EXPORT_TOKEN ?? '',
      destination,
      process.cwd(),
      clientId && clientSecret ? { clientId, clientSecret } : undefined,
    ),
  ),
)
