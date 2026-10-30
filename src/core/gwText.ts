import { pointsBudgetOf } from './battle'
import { type CatalogueEdition, editionLabel } from './catalogueEdition'
import { countLabel } from './text'
import type { UnitGroup } from './unitGroups'

export type GwTextRoster = {
  name: string
  faction: string
  detachments: { name: string; points: number | null }[]
  dispositions: string[]
  size: string
  limit: number
  /** A custom points budget, written in place of the battle size's own total. */
  pointsBudget?: number
  points: number
  units: {
    name: string
    nickname?: string
    models?: number
    entry?: number
    attachedToEntry?: number
    points: number
    group: 'character' | 'battleline' | 'transport' | 'other'
    warlord: boolean
    joined: { label: string; name: string }[]
    enhancements: string[]
    upgrades: string[]
    wargear: { name: string; count: number }[]
  }[]
}

export const headings = {
  character: 'CHARACTERS',
  battleline: 'BATTLELINE',
  transport: 'DEDICATED TRANSPORTS',
  other: 'OTHER DATASHEETS',
} as const

/** A plain-text roster in the same human-readable shape as the official app export. */
export function toGwText(roster: GwTextRoster, version: string): string {
  const detachments = roster.detachments.map((detachment) => detachment.name).join(' and ')
  const detachmentPoints = roster.detachments.reduce((total, detachment) => total + (detachment.points ?? 0), 0)
  const lines = [
    `${roster.name} (${roster.points.toLocaleString('en-GB')} Points)`,
    '',
    roster.faction,
    detachments ? `${detachments} (${countLabel(detachmentPoints, 'Detachment Point')})` : 'No detachment',
    ...(roster.dispositions.length
      ? [`Force Disposition${roster.dispositions.length === 1 ? '' : 's'}: ${roster.dispositions.join(', ')}`]
      : []),
    `${roster.size} (${pointsBudgetOf(roster).toLocaleString('en-GB')} Points)`,
  ]

  for (const group of Object.keys(headings) as (keyof typeof headings)[]) {
    const units = roster.units.filter((unit) => unit.group === group)
    if (!units.length) continue
    lines.push('', headings[group])
    for (const unit of units) {
      lines.push('', `${unit.name} (${unit.points.toLocaleString('en-GB')} Points)`)
      if (unit.nickname) lines.push(`    • Custom name: ${unit.nickname}`)
      for (const relation of unit.joined) lines.push(`    • ${relation.label}: ${relation.name}`)
      if (unit.warlord) lines.push('    • Warlord')
      for (const item of unit.wargear) lines.push(`    • ${item.count}x ${item.name}`)
      for (const enhancement of unit.enhancements) lines.push(`    • Enhancement: ${enhancement}`)
      for (const upgrade of unit.upgrades) lines.push(`    • Enhancement: ${upgrade}`)
      if (unit.models !== undefined) lines.push(`    • Models: ${unit.models}`)
      if (unit.entry !== undefined) lines.push(`    • Roster entry: ${unit.entry}`)
      if (unit.attachedToEntry !== undefined) lines.push(`    • Attached to entry: ${unit.attachedToEntry}`)
    }
  }

  lines.push('', `Exported with Praetorium.gg v${version}`)
  return `${lines.join('\n')}\n`
}

export function gwTextGroup(group: UnitGroup): GwTextRoster['units'][number]['group'] {
  if (group === 'epic-hero' || group === 'character') return 'character'
  if (group === 'battleline' || group === 'transport') return group
  return 'other'
}

/** The rules version and ruleset an export was written against, which an import resolves the list with. */
export const gwTextVersionLines = (edition: Pick<CatalogueEdition, 'name' | 'status'> | undefined, catalogueId: string) =>
  (edition ? `\nCodex: ${editionLabel(edition)}` : '') + `\nRuleset: ${catalogueId}\n`
