import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { legacyIdsSchema } from '../src/core/legacyIds'
import { vsDataMissionPackSchema } from '../src/shared/vsData'

/**
 * Adds to `catalogue/legacy-ids/` every Game Datacards Stratagem and mission ID an unpacked VS Data catalogue release
 * aliases, against the VS Data ID it names. The maps are append-only: an ID they already hold never moves.
 *
 *   pnpm exec tsx scripts/freezeLegacyIds.ts <unpacked release>
 */
const [release] = process.argv.slice(2)
if (!release) throw new Error('Usage: tsx scripts/freezeLegacyIds.ts <unpacked VS Data release>')
const folder = path.join(import.meta.dirname, '../catalogue/legacy-ids')
const read = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(release, name), 'utf8'))

const manifest = z
  .object({ categories: z.array(z.object({ name: z.string(), records: z.array(z.object({ path: z.string() })) })) })
  .parse(read('manifest.json'))
const identity = z
  .object({ entries: z.array(z.object({ id: z.string(), aliases: z.array(z.string()).optional(), retired: z.unknown().optional() })) })
  .parse(read('identity.json'))
const packs = manifest.categories
  .filter((category) => category.name === 'mission-packs')
  .flatMap((category) =>
    category.records.map((record) => vsDataMissionPackSchema.parse(z.object({ data: z.unknown() }).parse(read(record.path)).data)),
  )

/** A Game Datacards ID as a battle log stores it, from VS Data's dotted alias for it. */
const stored = (alias: string, prefix: RegExp) => (prefix.test(alias) ? alias.replace(prefix, '').replaceAll('.', '-') : null)
const STRATAGEM = /^gdc\.(?:core\.)?stratagem\./
const MISSION = /^gdc\.mission\.(?:primary|secondary|deployment|layout|twist)\./

const found = {
  stratagems: identity.entries.flatMap((entry) =>
    entry.retired
      ? []
      : (entry.aliases ?? []).flatMap((alias) => [stored(alias, STRATAGEM)].flatMap((id) => (id ? [[id, entry.id] as const] : []))),
  ),
  missions: packs.flatMap((pack) =>
    [...pack.primaries, ...pack.secondaries, ...pack.deployments, ...pack.layouts, ...pack.twists].flatMap((member) =>
      member.aliases.flatMap((alias) => [stored(alias, MISSION)].flatMap((id) => (id ? [[id, member.id] as const] : []))),
    ),
  ),
}
for (const section of ['stratagems', 'missions'] as const) {
  const file = path.join(folder, `${section}.json`)
  const frozen = legacyIdsSchema.parse(
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { format: 'praetorium.legacy-ids.v1', ids: {} },
  )
  for (const [id, current] of found[section]) {
    const held = frozen.ids[id]
    if (held !== undefined && held !== current) throw new Error(`${id} is frozen as ${held}; this release names it ${current}`)
    frozen.ids[id] = current
  }
  const ids = Object.fromEntries(Object.entries(frozen.ids).toSorted(([left], [right]) => (left < right ? -1 : 1)))
  fs.writeFileSync(file, `${JSON.stringify({ ...frozen, ids }, null, 2)}\n`)
  console.log(`${Object.keys(ids).length} ${section} IDs frozen`)
}
