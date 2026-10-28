import type { Attachment } from './attach'
import type { PrintedTransport } from './transport'
import { attachmentRows } from './attachmentRows'
import { customPointsBudget, type FormatRuleId, pointsBudgetOf, type Roster, strategicReserveLimit, type SubmittedUnit } from './battle'
import type { RosterPick } from './roster'
import type { RosterReminder } from './reminders'
import { nicknamedUnit } from './unitNotes'
import type { UnitGroup } from './unitGroups'
import { type CatalogueEdition, editionLabel } from './catalogueEdition'
import { hasWarlordToggle } from './unitChoices'

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
    keywords: readonly string[]
    toggles: readonly { name: string; selected: boolean }[]
    size: { models: number; resizable: boolean }
    attachment: Attachment | null
    wargear: readonly { name: string; count: number }[]
    enhancements: readonly string[]
    upgrades: readonly string[]
    formationOptions: readonly ('battlefield' | 'strategic-reserves' | 'deep-strike' | 'embarked')[]
    prebattleRules: readonly ('infiltrators' | 'scouts')[]
    strategicReserveExempt?: boolean
    embarksWithBodyguard?: boolean
    embarkedSpace?: number
    transport?: boolean
  }[]
}

type UnitDetails = readonly {
  entryId: string
  wounds?: number
  transportRule?: string
  transportCapacity?: PrintedTransport
}[]

export function rosterSnapshot(saved: SavedRoster, priced: PricedRoster, details: UnitDetails): Roster {
  const pointsBudget = customPointsBudget(saved.limit, saved.pointsBudget)
  return {
    // A list nobody named is fielded under the label it had when it was fielded. The
    // log and the seat then keep saying that, whatever the library later folds.
    name: saved.name || priced.label,
    id: saved.id,
    reminders: saved.reminders && frozenReminders(saved.reminders, priced.units),
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
      units: frozenUnits(saved.picks, priced.units, details),
    },
  }
}

/** Alerts named by pick position, renamed to the position of the unit each pick was priced into. */
export function frozenReminders(reminders: readonly RosterReminder[], units: readonly { key: number }[]): RosterReminder[] {
  return reminders.flatMap((reminder) => {
    const unitIndex = reminder.unit?.index
    const index = unitIndex === undefined ? 0 : units.findIndex((unit) => unit.key === unitIndex)
    if (index === -1) return []
    return [
      {
        ...reminder,
        ...(reminder.unit ? { unit: { ...reminder.unit, index } } : {}),
        timings: reminder.timings.map((timing) => ({ ...timing })),
      },
    ]
  })
}

/**
 * The units a battle fields from these picks, keyed as its log will name them.
 *
 * The builder reads its own list through this too, so the embarks it offers are
 * judged on the army setup will be handed.
 */
export function frozenUnits(picks: readonly RosterPick[], units: PricedRoster['units'], details: UnitDetails): SubmittedUnit[] {
  const keyedPicks = picks.map((pick, key) => ({ ...pick, key }))
  // Both spaces of the same army: what each pick was priced into, and what the
  // snapshot calls it. A pick the catalogue could not build has neither.
  const unitsByPick = picks.map((_, at) => units.find((unit) => unit.key === at))
  const keysByPick = new Map(units.map((unit, index) => [unit.key, `${index}-${unit.entryId}`]))
  // What a character joined, in the keys the snapshot names units by.
  const hostsByPick = new Map(
    picks.flatMap((pick, at) => {
      const host = pick.attachedTo === undefined ? undefined : keysByPick.get(pick.attachedTo)
      return host === undefined ? [] : [[at, host] as const]
    }),
  )
  // Where each unit the list starts embarked rides, kept on the unit a character joined.
  const transportsByPick = new Map(
    picks.flatMap((pick, at) => {
      const transport = pick.attachedTo === undefined && pick.embarkedIn !== undefined ? keysByPick.get(pick.embarkedIn) : undefined
      return transport === undefined ? [] : [[at, transport] as const]
    }),
  )
  const detailsByEntry = new Map(details.map((entry) => [entry.entryId, entry]))
  return units.map((unit, index) => {
    const detail = detailsByEntry.get(unit.entryId)
    const { nickname, note } = picks[unit.key] ?? {}
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
      keywords: [...unit.keywords],
      group: unit.group,
      warlord: hasWarlordToggle(unit.toggles),
      warlordEligible: unit.toggles.some((toggle) => toggle.name === 'Warlord'),
      wargear: unit.wargear.map((piece) => ({ ...piece })),
      enhancements: [...unit.enhancements],
      upgrades: [...unit.upgrades],
      joined: attachmentRows(keyedPicks, unitsByPick, unit.key).map(({ label, name }) => ({ label, name })),
      ...(hostsByPick.has(unit.key) ? { attachedTo: hostsByPick.get(unit.key) } : {}),
      formationOptions: [...unit.formationOptions],
      prebattleRules: [...unit.prebattleRules],
      ...(unit.strategicReserveExempt ? { strategicReserveExempt: true } : {}),
      ...(unit.embarksWithBodyguard ? { embarksWithBodyguard: true } : {}),
      ...(unit.embarkedSpace ? { embarkedSpace: unit.embarkedSpace } : {}),
      ...(unit.transport ? { transport: true } : {}),
      ...(transportsByPick.has(unit.key) ? { startsEmbarkedIn: transportsByPick.get(unit.key) } : {}),
    }
  })
}
