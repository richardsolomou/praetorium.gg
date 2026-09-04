import type { Attachment } from './attach'
import { attachmentRows } from './attachmentRows'
import type { FormatRuleId, Roster } from './battle'
import type { RosterPick } from './roster'
import type { UnitGroup } from './unitGroups'

type SavedRoster = {
  id: string
  name: string
  catalogueId: string
  detachmentIds: readonly string[]
  disposition: string | null
  limit: number
  picks: readonly RosterPick[]
  waivedRules: readonly FormatRuleId[]
}

type PricedRoster = {
  points: number
  revision: string
  /** What an unnamed list is called, frozen here: a battle keeps the name it was fielded under. */
  label: string
  detachment: string | null
  detachments: readonly { name: string; points: number | null }[]
  detachmentPointBudget: number | null
  disposition: string | null | undefined
  units: readonly {
    /** The position of the pick this was priced from, since a pick that cannot be built has no unit. */
    key: number
    entryId: string
    name: string
    points: number
    group: UnitGroup
    toggles: readonly { name: string; selected: boolean }[]
    size: { models: number; resizable: boolean }
    attachment: Attachment | null
    wargear: readonly { name: string; count: number }[]
    enhancements: readonly string[]
    upgrades: readonly string[]
    formationOptions: readonly ('battlefield' | 'strategic-reserves' | 'deep-strike' | 'embarked')[]
    prebattleRules: readonly ('infiltrators' | 'scouts')[]
  }[]
}

export function rosterSnapshot(saved: SavedRoster, priced: PricedRoster, wounds: readonly { entryId: string; wounds: number }[]): Roster {
  const keyedPicks = saved.picks.map((pick, key) => ({ ...pick, key }))
  // Both spaces of the same army: what each pick was priced into, and what the
  // snapshot calls it. A pick the catalogue could not build has neither.
  const unitsByPick = saved.picks.map((_, at) => priced.units.find((unit) => unit.key === at))
  const keysByPick = new Map(priced.units.map((unit, index) => [unit.key, `${index}-${unit.entryId}`]))
  // What a character joined, in the keys the snapshot names units by.
  const hostsByPick = new Map(
    saved.picks.flatMap((pick, at) => {
      const host = pick.attachedTo === undefined ? undefined : keysByPick.get(pick.attachedTo)
      return host === undefined ? [] : [[at, host] as const]
    }),
  )
  const woundsOf = new Map(wounds.map((entry) => [entry.entryId, entry.wounds]))
  return {
    // A list nobody named is fielded under the label it had when it was fielded. The
    // log and the seat then keep saying that, whatever the library later folds.
    name: saved.name || priced.label,
    id: saved.id,
    text: [
      `${priced.points} / ${saved.limit} pts`,
      ...priced.detachments.map(
        (detachment, index) => `${index ? 'Detachment' : 'Primary detachment'}: ${detachment.name} (${detachment.points ?? '?'} DP)`,
      ),
      '',
      ...priced.units.map((unit) => `${unit.name}${unit.size.resizable ? ` (${unit.size.models})` : ''} — ${unit.points}`),
    ].join('\n'),
    built: {
      catalogueId: saved.catalogueId,
      revision: priced.revision,
      limit: saved.limit,
      detachment: priced.detachment,
      detachments: [...priced.detachments],
      detachmentPointBudget: priced.detachmentPointBudget,
      disposition: priced.disposition ?? null,
      detachmentIds: [...saved.detachmentIds],
      // Carried into the battle so the snapshot is priced under the rules it was
      // built under: a waiver left behind would report the roster as illegal on the
      // one screen where nothing can be done about it.
      waivedRules: [...saved.waivedRules],
      picks: saved.picks.map((pick) => ({ ...pick })),
      units: priced.units.map((unit, index) => ({
        key: `${index}-${unit.entryId}`,
        entryId: unit.entryId,
        name: unit.name,
        points: unit.points,
        models: unit.size.models,
        ...(woundsOf.has(unit.entryId) ? { wounds: woundsOf.get(unit.entryId) } : {}),
        group: unit.group,
        warlord: unit.toggles.some((toggle) => toggle.name === 'Warlord' && toggle.selected),
        warlordEligible: unit.toggles.some((toggle) => toggle.name === 'Warlord'),
        wargear: unit.wargear.map((piece) => ({ ...piece })),
        enhancements: [...unit.enhancements],
        upgrades: [...unit.upgrades],
        joined: attachmentRows(keyedPicks, unitsByPick, unit.key).map(({ label, name }) => ({ label, name })),
        ...(hostsByPick.has(unit.key) ? { attachedTo: hostsByPick.get(unit.key) } : {}),
        formationOptions: [...unit.formationOptions],
        prebattleRules: [...unit.prebattleRules],
      })),
    },
  }
}
