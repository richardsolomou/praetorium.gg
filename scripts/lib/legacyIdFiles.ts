import fs from 'node:fs'
import path from 'node:path'
import { legacyIdsSchema } from '../../src/core/legacyIds'

const folder = path.join(import.meta.dirname, '../../catalogue/legacy-ids')

/** Adds IDs to a frozen map in `catalogue/legacy-ids/`, refusing to move one it already holds. */
export function freezeLegacyIds(section: string, found: Iterable<readonly [string, string]>) {
  const file = path.join(folder, `${section}.json`)
  const frozen = legacyIdsSchema.parse(
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { format: 'praetorium.legacy-ids.v1', ids: {} },
  )
  for (const [id, current] of found) {
    const held = frozen.ids[id]
    if (held !== undefined && held !== current) throw new Error(`${section}: ${id} is frozen as ${held}; this run names it ${current}`)
    frozen.ids[id] = current
  }
  const ids = Object.fromEntries(Object.entries(frozen.ids).toSorted(([left], [right]) => (left < right ? -1 : 1)))
  fs.writeFileSync(file, `${JSON.stringify({ ...frozen, ids }, null, 2)}\n`)
  console.log(`${Object.keys(ids).length} ${section} IDs frozen`)
}
