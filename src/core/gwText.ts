export type GwTextRoster = {
  name: string
  faction: string
  detachments: { name: string; points: number | null }[]
  dispositions: string[]
  size: string
  limit: number
  points: number
  units: {
    name: string
    points: number
    group: 'character' | 'battleline' | 'transport' | 'other'
    warlord: boolean
    joined: { label: string; name: string }[]
    enhancements: string[]
    upgrades: string[]
    wargear: { name: string; count: number }[]
  }[]
}

const headings = {
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
    detachments ? `${detachments} (${detachmentPoints} Detachment ${detachmentPoints === 1 ? 'Point' : 'Points'})` : 'No detachment',
    ...(roster.dispositions.length
      ? [`Force Disposition${roster.dispositions.length === 1 ? '' : 's'}: ${roster.dispositions.join(', ')}`]
      : []),
    `${roster.size} (${roster.limit.toLocaleString('en-GB')} Points)`,
  ]

  for (const group of Object.keys(headings) as (keyof typeof headings)[]) {
    const units = roster.units.filter((unit) => unit.group === group)
    if (!units.length) continue
    lines.push('', headings[group])
    for (const unit of units) {
      lines.push('', `${unit.name} (${unit.points.toLocaleString('en-GB')} Points)`)
      for (const relation of unit.joined) lines.push(`    • ${relation.label}: ${relation.name}`)
      if (unit.warlord) lines.push('    • Warlord')
      for (const item of unit.wargear) lines.push(`    • ${item.count}x ${item.name}`)
      for (const enhancement of unit.enhancements) lines.push(`    • Enhancement: ${enhancement}`)
      for (const upgrade of unit.upgrades) lines.push(`    • Enhancement: ${upgrade}`)
    }
  }

  lines.push('', `Exported with Praetorium.gg v${version}`)
  return `${lines.join('\n')}\n`
}
