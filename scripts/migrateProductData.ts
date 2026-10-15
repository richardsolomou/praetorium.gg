import { migrateProductData } from './lib/productDataMigrations'

const target = process.argv[2]
if (process.argv.length !== 3 || (target !== 'production' && target !== 'staging'))
  throw new Error('Usage: migrateProductData.ts production|staging')
const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
const totals = await migrateProductData({
  url: required('SPACETIME_URL'),
  database: `praetorium-${target}`,
  ownerToken: required('SPACETIME_OWNER_TOKEN'),
  operatorToken: required('SPACETIME_OPERATOR_TOKEN'),
  accessClientId: process.env.SPACETIME_ACCESS_CLIENT_ID,
  accessClientSecret: process.env.SPACETIME_ACCESS_CLIENT_SECRET,
})
console.log(
  `Migrated ${totals.rosters} saved rosters and ${totals.collection} datasheet favourites; deleted ${totals.journal_games} journal games and ${totals.journal_events} journal events`,
)
