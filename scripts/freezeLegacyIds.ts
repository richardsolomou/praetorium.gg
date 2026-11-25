import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { vsDataMissionPackSchema } from '../src/shared/vsData'
import { freezeLegacyIds } from './lib/legacyIdFiles'

/**
 * Adds to `catalogue/legacy-ids/` every Game Datacards Stratagem, mission and rules-document rule ID an unpacked VS Data
 * catalogue release aliases, against the VS Data ID it names. The maps are append-only: an ID they already hold never
 * moves.
 *
 *   pnpm exec tsx scripts/freezeLegacyIds.ts <unpacked release>
 */
const [release] = process.argv.slice(2)
if (!release) throw new Error('Usage: tsx scripts/freezeLegacyIds.ts <unpacked VS Data release>')
const read = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(release, name), 'utf8'))

const manifest = z
  .object({ categories: z.array(z.object({ name: z.string(), records: z.array(z.object({ path: z.string() })) })) })
  .parse(read('manifest.json'))
const identity = z
  .object({
    entries: z.array(
      z.object({ kind: z.string(), id: z.string(), aliases: z.array(z.string()).optional(), retired: z.unknown().optional() }),
    ),
  })
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
// A rules document's rule is aliased by its Game Datacards id as is, which a page addressed it by where it printed no number.
const RULE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const found = {
  stratagems: identity.entries.flatMap((entry) =>
    entry.retired
      ? []
      : (entry.aliases ?? []).flatMap((alias) => [stored(alias, STRATAGEM)].flatMap((id) => (id ? [[id, entry.id] as const] : []))),
  ),
  rules: identity.entries.flatMap((entry) =>
    entry.kind === 'core-rule' && !entry.retired
      ? (entry.aliases ?? []).flatMap((alias) => (RULE.test(alias) ? [[alias, entry.id] as const] : []))
      : [],
  ),
  missions: packs.flatMap((pack) =>
    [...pack.primaries, ...pack.secondaries, ...pack.deployments, ...pack.layouts, ...pack.twists].flatMap((member) =>
      member.aliases.flatMap((alias) => [stored(alias, MISSION)].flatMap((id) => (id ? [[id, member.id] as const] : []))),
    ),
  ),
}
for (const section of ['stratagems', 'missions', 'rules'] as const) freezeLegacyIds(section, found[section])
