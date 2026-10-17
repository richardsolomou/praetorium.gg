import { readFile } from 'node:fs/promises'
import { publishSpacetimeModule } from 'ras-stack/spacetime'

const [file, target] = process.argv.slice(2)
if (process.argv.length !== 4 || !file || (target !== 'production' && target !== 'staging'))
  throw new Error('Usage: publishProductModule.ts <bundle.js> production|staging')
const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
// The module environment was declared on first publish and SpacetimeDB keeps it, so updates send none.
await publishSpacetimeModule(
  {
    url: required('SPACETIME_URL'),
    database: `praetorium-${target}`,
    token: required('SPACETIME_OWNER_TOKEN'),
    headers: {
      'CF-Access-Client-Id': required('SPACETIME_ACCESS_CLIENT_ID'),
      'CF-Access-Client-Secret': required('SPACETIME_ACCESS_CLIENT_SECRET'),
    },
  },
  await readFile(file),
  { breakClients: true },
)
console.log(`Published the product module to praetorium-${target}`)
