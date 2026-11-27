import fs from 'node:fs'
import path from 'node:path'
import { legacyIdsSchema } from '../../src/core/legacyIds'

const folder = path.join(import.meta.dirname, '../../catalogue/legacy-ids')

/**
 * Adds IDs to a frozen map in `catalogue/legacy-ids/`, refusing to move one it already holds. `read` gives the IDs
 * readers see, such as the map with its reviewed corrections applied; a found ID is checked against it and the frozen
 * entry itself never changes.
 */
export function freezeLegacyIds(
  section: string,
  found: Iterable<readonly [string, string]>,
  read: (frozen: Readonly<Record<string, string>>) => Readonly<Record<string, string>> = (frozen) => frozen,
) {
  const file = path.join(folder, `${section}.json`)
  const frozen = legacyIdsSchema.parse(
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { format: 'praetorium.legacy-ids.v1', ids: {} },
  )
  const held = read(frozen.ids)
  const moved: string[] = []
  for (const [id, current] of found) {
    if (held[id] === undefined) frozen.ids[id] = current
    else if (held[id] !== current) moved.push(`${id} is frozen as ${held[id]}; this run names it ${current}`)
  }
  if (moved.length) throw new Error(`${section}: ${moved.length} frozen IDs would move:\n  ${moved.toSorted().join('\n  ')}`)
  const ids = Object.fromEntries(Object.entries(frozen.ids).toSorted(([left], [right]) => (left < right ? -1 : 1)))
  fs.writeFileSync(file, `${JSON.stringify({ ...frozen, ids }, null, 2)}\n`)
  console.log(`${Object.keys(ids).length} ${section} IDs frozen`)
}
