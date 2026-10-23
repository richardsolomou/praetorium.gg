import { migrateProductData } from './lib/productDataMigrations'
import { requiredEnv } from './lib/requiredEnv'

const target = process.argv[2]
if (process.argv.length !== 3 || (target !== 'production' && target !== 'staging'))
  throw new Error('Usage: migrateProductData.ts production|staging')
const totals = await migrateProductData({
  url: requiredEnv('SPACETIME_URL'),
  database: `praetorium-${target}`,
  ownerToken: requiredEnv('SPACETIME_OWNER_TOKEN'),
  operatorToken: requiredEnv('SPACETIME_OPERATOR_TOKEN'),
  accessClientId: process.env.SPACETIME_ACCESS_CLIENT_ID,
  accessClientSecret: process.env.SPACETIME_ACCESS_CLIENT_SECRET,
})
console.log(`Migrated ${totals.rosters} saved rosters and ${totals.collection} datasheet favourites`)
