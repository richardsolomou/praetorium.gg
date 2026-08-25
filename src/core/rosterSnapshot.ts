import type { Attachment } from './attach'
import { attachmentRows } from './attachmentRows'
import type { Roster } from './battle'
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
}

type PricedRoster = {
  points: number
  revision: string
  detachment: string | null
  detachments: readonly { name: string; points: number | null }[]
  detachmentPointBudget: number | null
  disposition: string | null | undefined
  units: readonly {
    entryId: string
    name: string
    points: number
    group: UnitGroup
    size: { models: number; resizable: boolean }
    attachment: Attachment | null
    wargear: readonly { name: string; count: number }[]
    enhancements: readonly string[]
    upgrades: readonly string[]
    formationOptions: readonly ('battlefield' | 'strategic-reserves' | 'deep-strike' | 'embarked')[]
    prebattleRules: readonly ('infiltrators' | 'scouts')[]
  }[]
}

export function rosterSnapshot(saved: SavedRoster, priced: PricedRoster): Roster {
  const keyedPicks = saved.picks.map((pick, key) => ({ ...pick, key }))
  return {
    name: saved.name,
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
      picks: saved.picks.map((pick) => ({ ...pick })),
      units: priced.units.map((unit, index) => ({
        key: `${index}-${unit.entryId}`,
        entryId: unit.entryId,
        name: unit.name,
        points: unit.points,
        models: unit.size.models,
        group: unit.group,
        wargear: unit.wargear.map((piece) => ({ ...piece })),
        enhancements: [...unit.enhancements],
        upgrades: [...unit.upgrades],
        joined: attachmentRows(keyedPicks, priced.units, index).map(({ label, name }) => ({ label, name })),
        formationOptions: [...unit.formationOptions],
        prebattleRules: [...unit.prebattleRules],
      })),
    },
  }
}
