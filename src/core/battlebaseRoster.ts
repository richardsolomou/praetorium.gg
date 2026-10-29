import { z } from 'zod'
import { ROSTER_NAME_MAX_LENGTH, type Roster } from './battle'
import { catalogueEditionId } from './catalogueEdition'
import { routeSlug } from './slug'
import type { TextRoster, TextRosterUnit } from './textRoster'

const ref = z.string().max(200)
const rows = <T extends z.ZodType>(row: T) =>
  z
    .array(row)
    .max(2_000)
    .nullish()
    .transform((value) => value ?? [])

/** The part of a BattleBase roster an import reads; every name in it is an id into BattleBase's own army data. */
export const battlebaseRosterSchema = z.object({
  title: z.string().max(500).nullish(),
  factionId: ref,
  detachmentId: ref.nullish(),
  detachmentIds: z.array(ref).max(8).nullish(),
  forceDispositionId: ref.nullish(),
  units: z.array(z.object({ id: ref, datasheetId: ref })).max(200),
  unitModels: rows(
    z.object({ id: ref, unitId: ref, count: z.number().int().nonnegative(), modelId: ref, isWarlord: z.boolean().nullish() }),
  ),
  unitWargear: rows(z.object({ unitId: ref, count: z.number().int().nonnegative(), wargearEditSetWargearItemId: ref })),
  unitModelWargear: rows(z.object({ unitModelId: ref, count: z.number().int().nonnegative(), wargearEditSetWargearItemId: ref })),
  unitEnhancements: rows(z.object({ unitId: ref, enhancementId: ref })),
  unitModelEnhancements: rows(z.object({ unitModelId: ref, enhancementId: ref })),
  unitAttachments: rows(z.object({ attachedUnitId: ref, targetUnitId: ref })),
})

export type BattlebaseRoster = z.infer<typeof battlebaseRosterSchema>

/** BattleBase's army data reduced to the names an import needs, each keyed by BattleBase's id for it. */
export type BattlebaseNames = {
  factions: Record<string, string>
  datasheets: Record<string, string>
  models: Record<string, string>
  /** Keyed by the wargear choice a roster records, which names the item it picks. */
  wargear: Record<string, string>
  enhancements: Record<string, string>
  detachments: Record<string, string>
  forceDispositions: Record<string, string>
  stratagems: string[]
}

/**
 * A BattleBase roster as the list importer reads army text, or null when any id in it has no
 * name in the data, since an import never drops or guesses what a list contained.
 */
export function battlebaseTextRoster(roster: BattlebaseRoster, names: BattlebaseNames, limit: number | null): TextRoster | null {
  const named = (table: Record<string, string>, key: string | null | undefined) => (key ? table[key] : undefined)
  const faction = named(names.factions, roster.factionId)
  const detachmentIds = roster.detachmentIds ?? (roster.detachmentId ? [roster.detachmentId] : [])
  const detachments = detachmentIds.map((key) => named(names.detachments, key))
  if (!faction || detachments.some((name) => !name)) return null
  const entries = new Map(roster.units.map((unit, at) => [unit.id, at + 1]))
  const units: TextRosterUnit[] = []
  for (const unit of roster.units) {
    const name = named(names.datasheets, unit.datasheetId)
    if (!name) return null
    const models = roster.unitModels.filter((model) => model.unitId === unit.id && model.count > 0)
    const selections: TextRosterUnit['selections'] = []
    for (const model of models) {
      const modelName = named(names.models, model.modelId)
      if (!modelName) return null
      for (const choice of roster.unitModelWargear.filter((wargear) => wargear.unitModelId === model.id && wargear.count > 0)) {
        const item = named(names.wargear, choice.wargearEditSetWargearItemId)
        if (!item) return null
        selections.push({ name: item, count: choice.count, model: modelName })
      }
      for (const choice of roster.unitModelEnhancements.filter((enhancement) => enhancement.unitModelId === model.id)) {
        const enhancement = named(names.enhancements, choice.enhancementId)
        if (!enhancement) return null
        selections.push({ name: enhancement, count: 1 })
      }
    }
    for (const choice of roster.unitWargear.filter((wargear) => wargear.unitId === unit.id && wargear.count > 0)) {
      const item = named(names.wargear, choice.wargearEditSetWargearItemId)
      if (!item) return null
      selections.push({ name: item, count: choice.count })
    }
    for (const choice of roster.unitEnhancements.filter((enhancement) => enhancement.unitId === unit.id)) {
      const enhancement = named(names.enhancements, choice.enhancementId)
      if (!enhancement) return null
      selections.push({ name: enhancement, count: 1 })
    }
    const target = roster.unitAttachments.find((attachment) => attachment.attachedUnitId === unit.id)?.targetUnitId
    units.push({
      name,
      selections,
      leading: null,
      models: models.reduce((total, model) => total + model.count, 0),
      entry: entries.get(unit.id),
      ...(target && entries.has(target) ? { attachedToEntry: entries.get(target) } : {}),
      warlord: models.some((model) => model.isWarlord),
    })
  }
  return {
    name: roster.title?.trim() || faction,
    faction,
    detachment: detachments.join(', ') || null,
    disposition: named(names.forceDispositions, roster.forceDispositionId) ?? null,
    limit,
    units,
  }
}

/** A list as a reader sees it when the catalogue cannot rebuild it: every unit and choice, by name. */
export function textRosterLines(roster: TextRoster): string[] {
  return [
    roster.faction,
    ...(roster.detachment ? [roster.detachment] : []),
    '',
    ...roster.units.flatMap((unit) => [
      `${unit.name}${unit.models && unit.models > 1 ? ` (${unit.models})` : ''}${unit.warlord ? ' · Warlord' : ''}`,
      ...unit.selections.map((selection) => `  ${selection.count > 1 ? `${selection.count}x ` : ''}${selection.name}`),
    ]),
  ]
}

/** What an import needs to know of a catalogue faction, as the battle list already names them. */
export type ImportFaction = { id: string; slug: string; displayName: string; detachments?: readonly { name: string }[] }

const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to'])

/** "dawn-of-war" read as "Dawn of War", for names BattleBase records only as an id. */
export function titled(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word, index) => (index && SMALL_WORDS.has(word) ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ')
}

/** The catalogue army BattleBase's `faction-…` id names, preferring the base catalogue since BattleBase names no rules version. */
export function importFaction(id: string | null | undefined, factions: readonly ImportFaction[]) {
  const wanted = id?.replace(/^faction-/, '')
  if (!wanted) return { name: null, faction: null }
  const faction =
    factions
      .filter((candidate) => candidate.slug === wanted || routeSlug(candidate.displayName) === wanted)
      .sort((left, right) => Number(catalogueEditionId(left.id) !== null) - Number(catalogueEditionId(right.id) !== null))[0] ?? null
  return { name: faction?.displayName ?? titled(wanted), faction }
}

/**
 * A detachment's name, found by the words of its id since BattleBase prefixes them with a
 * faction it sometimes misspells and suffixes promotional versions, as in
 * `detachment-necons-cursed-legion` or `detachment-deathwatch-black-spear-task-force-grotmas`.
 * One the catalogue does not list is named from its id after the faction it is filed under.
 */
export function importDetachment(id: string, faction: ImportFaction | null, factions: readonly ImportFaction[]) {
  const bare = `-${id.replace(/^detachment-/, '')}-`
  const listed = (faction?.detachments ?? [])
    .filter((detachment) => bare.includes(`-${routeSlug(detachment.name)}-`))
    .sort((left, right) => right.name.length - left.name.length)[0]
  if (listed) return listed.name
  const filedUnder = factions
    .map((candidate) => `-${candidate.slug}-`)
    .filter((prefix) => bare.startsWith(prefix) && bare.length > prefix.length)
    .sort((left, right) => right.length - left.length)[0]
  return filedUnder ? titled(bare.slice(filedUnder.length, -1)) : null
}

/**
 * An army the catalogue cannot rebuild unit by unit: its faction and detachments, and the
 * whole list as BattleBase recorded it when there is one.
 */
export function namedArmy(
  ids: { faction: string | null | undefined; detachments: readonly string[] },
  list: TextRoster | null,
  factions: readonly ImportFaction[],
  limit: number | null,
  revision: string,
): Roster {
  const { name, faction } = importFaction(ids.faction, factions)
  const detachments = ids.detachments.flatMap((id) => importDetachment(id, faction, factions) ?? [])
  const label = name ?? 'Unknown army'
  return {
    name: list?.name.slice(0, ROSTER_NAME_MAX_LENGTH) || label,
    text: (list
      ? textRosterLines({ ...list, faction: label, detachment: detachments.join(', ') || list.detachment })
      : [label, ...detachments]
    ).join('\n'),
    ...(faction && limit !== null
      ? {
          built: {
            catalogueId: faction.id,
            revision,
            limit,
            detachment: detachments[0] ?? null,
            detachments: detachments.map((detachment) => ({ name: detachment, points: null })),
            disposition: null,
            units: [],
          },
        }
      : {}),
  }
}
