import fs from 'node:fs'
import path from 'node:path'
import { legacyIdsSchema } from '../../src/core/legacyIds'

const folder = path.join(import.meta.dirname, '../../catalogue/legacy-ids')
const byKey = <Value>(record: Record<string, Value>) =>
  Object.fromEntries(Object.entries(record).toSorted(([left], [right]) => (left < right ? -1 : 1)))

/**
 * Adds IDs to a frozen map in `catalogue/legacy-ids/`, and the allegiance each ID implies where one does, refusing to
 * move an ID or allegiance it already holds. A held ID may gain an allegiance.
 */
export function freezeLegacyIds(
  section: string,
  found: Iterable<readonly [string, string]>,
  foundAllegiances: Iterable<readonly [string, string]> = [],
) {
  const file = path.join(folder, `${section}.json`)
  const frozen = legacyIdsSchema.parse(
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { format: 'praetorium.legacy-ids.v1', ids: {} },
  )
  for (const [id, current] of found) {
    const held = frozen.ids[id]
    if (held !== undefined && held !== current) throw new Error(`${section}: ${id} is frozen as ${held}; this run names it ${current}`)
    frozen.ids[id] = current
  }
  const allegiances = { ...frozen.allegiances }
  for (const [id, current] of foundAllegiances) {
    const held = allegiances[id]
    // A rules version's own key reads its bare ID where it holds none of its own.
    if (frozen.ids[id] === undefined && frozen.ids[id.slice(id.indexOf('~') + 1)] === undefined)
      throw new Error(`${section}: ${id} has an allegiance but no ID`)
    if (held !== undefined && held !== current)
      throw new Error(`${section}: ${id} is frozen with allegiance ${held}; this run names ${current}`)
    allegiances[id] = current
  }
  const written = { ...frozen, ids: byKey(frozen.ids), ...(Object.keys(allegiances).length ? { allegiances: byKey(allegiances) } : {}) }
  fs.writeFileSync(file, `${JSON.stringify(written, null, 2)}\n`)
  console.log(`${Object.keys(written.ids).length} ${section} IDs frozen`)
}
