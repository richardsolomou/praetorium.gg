import type { Attachment } from './attach'
import type { PrintedTransport } from './transport'
import { attachmentRows } from './attachmentRows'
import { customPointsBudget, type FormatRuleId, pointsBudgetOf, type Roster, strategicReserveLimit } from './battle'
import type { RosterPick } from './roster'
import { remindersForDetachments, type RosterReminder } from './reminders'
import { nicknamedUnit } from './unitNotes'
import type { UnitGroup } from './unitGroups'
import { type CatalogueEdition, editionLabel } from './catalogueEdition'

type SavedRoster = {
  id: string
  name: string
  catalogueId: string
  detachmentIds: readonly string[]
  disposition: string | null
  limit: number
  pointsBudget?: number | null
  picks: readonly RosterPick[]
  waivedRules: readonly FormatRuleId[]
  reminders?: readonly RosterReminder[]
  remindersEnabled?: boolean
}

type PricedRoster = {
  points: number
  edition?: Pick<CatalogueEdition, 'id' | 'name' | 'status'>
  revision: string
  strategicReserveFactsComplete?: boolean
  /** What an unnamed list is called, frozen here: a battle keeps the name it was fielded under. */
  label: string
  detachment: string | null
  detachments: readonly { name: string; points: number | null }[]
  detachmentPointBudget: number | null
  disposition: string | null | undefined
  dispositions: readonly string[]
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
    strategicReserveExempt?: boolean
    transport?: boolean
  }[]
}

export function rosterSnapshot(
  saved: SavedRoster,
  priced: PricedRoster,
  details: readonly {
    entryId: string
    wounds?: number
    transportRule?: string
    transportCapacity?: PrintedTransport
    keywords?: readonly string[]
  }[],
): Roster {
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
  // The transport each standalone unit starts in, in the same keys.
  const transportsByPick = new Map(
    saved.picks.flatMap((pick, at) => {
      const transport = pick.attachedTo !== undefined || pick.embarkedIn === undefined ? undefined : keysByPick.get(pick.embarkedIn)
      return transport === undefined ? [] : [[at, transport] as const]
    }),
  )
  const detailsByEntry = new Map(details.map((entry) => [entry.entryId, entry]))
  const pointsBudget = customPointsBudget(saved.limit, saved.pointsBudget)
  return {
    // A list nobody named is fielded under the label it had when it was fielded. The
    // log and the seat then keep saying that, whatever the library later folds.
    name: saved.name || priced.label,
    id: saved.id,
    reminders:
      saved.reminders &&
      remindersForDetachments(saved.reminders, saved.detachmentIds).flatMap((reminder) => {
        const unitIndex = reminder.unit?.index
        const index = unitIndex === undefined ? 0 : priced.units.findIndex((unit) => unit.key === unitIndex)
        if (index === -1) return []
        return [
          {
            ...reminder,
            ...(reminder.unit ? { unit: { ...reminder.unit, index } } : {}),
            timings: reminder.timings.map((timing) => ({ ...timing })),
          },
        ]
      }),
    remindersEnabled: saved.remindersEnabled ?? true,
    text: [
      `${priced.points} / ${pointsBudgetOf(saved)} pts`,
      ...(priced.edition ? [`Codex: ${editionLabel(priced.edition)}`] : []),
      ...priced.detachments.map(
        (detachment, index) => `${index ? 'Detachment' : 'Primary detachment'}: ${detachment.name} (${detachment.points ?? '?'} DP)`,
      ),
      '',
      ...priced.units.map(
        (unit) =>
          `${nicknamedUnit(unit.name, saved.picks[unit.key]?.nickname)}${unit.size.resizable ? ` (${unit.size.models})` : ''} — ${unit.points}`,
      ),
    ].join('\n'),
    built: {
      catalogueId: saved.catalogueId,
      ...(priced.edition ? { edition: { ...priced.edition } } : {}),
      revision: priced.revision,
      limit: saved.limit,
      ...(pointsBudget === null ? {} : { pointsBudget }),
      ...(priced.strategicReserveFactsComplete ? { strategicReserveLimit: strategicReserveLimit(pointsBudgetOf(saved)) } : {}),
      detachment: priced.detachment,
      detachments: [...priced.detachments],
      detachmentPointBudget: priced.detachmentPointBudget,
      disposition: priced.disposition ?? null,
      dispositions: [...priced.dispositions],
      detachmentIds: [...saved.detachmentIds],
      // Carried into the battle so the snapshot is priced under the rules it was
      // built under: a waiver left behind would report the roster as illegal on the
      // one screen where nothing can be done about it.
      waivedRules: [...saved.waivedRules],
      picks: saved.picks.map((pick) => ({ ...pick })),
      units: priced.units.map((unit, index) => {
        const detail = detailsByEntry.get(unit.entryId)
        const { nickname, note } = saved.picks[unit.key] ?? {}
        return {
          key: `${index}-${unit.entryId}`,
          entryId: unit.entryId,
          name: unit.name,
          ...(nickname ? { nickname } : {}),
          ...(note ? { note } : {}),
          points: unit.points,
          models: unit.size.models,
          ...(detail?.wounds ? { wounds: detail.wounds } : {}),
          ...(detail?.transportRule ? { transportRule: detail.transportRule } : {}),
          ...(detail?.transportCapacity ? { transportCapacity: detail.transportCapacity } : {}),
          ...(detail?.keywords ? { keywords: [...detail.keywords] } : {}),
          group: unit.group,
          warlord: unit.toggles.some((toggle) => toggle.name === 'Warlord' && toggle.selected),
          warlordEligible: unit.toggles.some((toggle) => toggle.name === 'Warlord'),
          wargear: unit.wargear.map((piece) => ({ ...piece })),
          enhancements: [...unit.enhancements],
          upgrades: [...unit.upgrades],
          joined: attachmentRows(keyedPicks, unitsByPick, unit.key).map(({ label, name }) => ({ label, name })),
          ...(hostsByPick.has(unit.key) ? { attachedTo: hostsByPick.get(unit.key) } : {}),
          ...(transportsByPick.has(unit.key) ? { startsEmbarkedIn: transportsByPick.get(unit.key) } : {}),
          formationOptions: [...unit.formationOptions],
          prebattleRules: [...unit.prebattleRules],
          ...(unit.strategicReserveExempt ? { strategicReserveExempt: true } : {}),
          ...(unit.transport ? { transport: true } : {}),
        }
      }),
    },
  }
}
