/**
 * `tsx scripts/replayAuthDeletions.ts <auth.sqlite> <product backup createdAt>` deletes again the product data of every
 * account the restored auth database records as deleted at or after the restored product backup was taken, so a
 * restore never brings a deleted player back. Run it with the restored product database's SPACETIME_URL,
 * SPACETIME_DATABASE and SPACETIME_OPERATOR_TOKEN; it is safe to repeat.
 */
import { DatabaseSync } from 'node:sqlite'
import { SpacetimeOperator } from '../src/server/spacetimeOperator'
import { requiredEnv } from './lib/requiredEnv'

const [file, since] = process.argv.slice(2)
const createdAt = Date.parse(since ?? '')
if (!file || Number.isNaN(createdAt)) throw new Error('Usage: replayAuthDeletions.ts <auth.sqlite> <product backup createdAt>')
const database = new DatabaseSync(file, { readOnly: true })
const deleted = database
  .prepare('select id from deletedUser where deletedAt >= ? order by deletedAt')
  .all(createdAt)
  .map((row) => String(row.id))
database.close()
const operator = new SpacetimeOperator(
  requiredEnv('SPACETIME_URL'),
  requiredEnv('SPACETIME_DATABASE'),
  requiredEnv('SPACETIME_OPERATOR_TOKEN'),
)
for (const userId of deleted) await operator.deleteUserData(userId)
console.log(`Deleted the product data of ${deleted.length} accounts deleted since ${new Date(createdAt).toISOString()}`)
