import { type NamedRosterDifferences, type RosterUnitChange, rosterDifferences } from '../core/rosterDifferences'
import { app } from './app'

type Compared = Parameters<typeof rosterDifferences>[0] & { id: string; name: string; baseRosterId: string | null }

/** How each variant differs from its group's base, with datasheets named from the current data. */
export async function variantDifferences(userId: string, rosters: readonly Compared[]) {
  const variants = rosters.filter((roster) => roster.baseRosterId)
  if (!variants.length) return new Map<string, NamedRosterDifferences>()
  const known = new Map(rosters.map((roster) => [roster.id, roster]))
  const missing = [...new Set(variants.map((roster) => roster.baseRosterId!))].filter((id) => !known.has(id))
  if (missing.length) for (const base of await app().service.savedRostersByIds(userId, missing)) known.set(base.id, base)
  const differences = new Map<string, NamedRosterDifferences>()
  for (const variant of variants) {
    const base = known.get(variant.baseRosterId!)
    if (base) differences.set(variant.id, await named(base, variant))
  }
  return differences
}

async function named(base: Compared, variant: Compared): Promise<NamedRosterDifferences> {
  const { added, removed, ...rest } = rosterDifferences(base, variant)
  const [before, after] = await Promise.all([app().catalogueFor(base.catalogueId), app().catalogueFor(variant.catalogueId)])
  const name = (loaded: typeof before) => (unit: RosterUnitChange) => ({
    name: loaded?.index.definitions.get(unit.entryId)?.name ?? unit.entryId,
    count: unit.count,
  })
  return { ...rest, baseId: base.id, baseName: base.name, added: added.map(name(after)), removed: removed.map(name(before)) }
}
