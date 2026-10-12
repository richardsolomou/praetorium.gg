import type { TextRoster, TextRosterUnit } from './textRoster'

const unitHeader = /^(.*?)\s+\(\d[\d,]* Points?\)$/i
const selection = /^\s*•\s*(?:(\d+)x\s+)?(.+?)\s*$/
const sectionHeading = /^(CHARACTERS?|BATTLELINE|DEDICATED TRANSPORTS|OTHER DATASHEETS|ALLIED UNITS)$/i

export function fromBattleBaseText(input: string): TextRoster | null {
  const lines = input.replaceAll('\r', '').split('\n')
  const title = lines.find((line) => line.trim())?.trim() ?? 'Imported list'
  const titleMatch = title.match(/^(.*?)\s+\((\d[\d,]*) Points?\)$/i)
  const factionAt = lines.findIndex((line) => line.trim() === title)
  const firstSection = lines.findIndex((line) => sectionHeading.test(line.trim()))
  const setup = lines
    .slice(factionAt + 1, firstSection < 0 ? undefined : firstSection)
    .map((line) => line.trim())
    .filter(Boolean)
  const faction = setup[0] ?? ''
  const sizeLine = setup.find((line) => /\([\d,]+ Points?\)$/i.test(line))
  if (!/Exported with (?:BattleBase|Praetorium\.gg)/i.test(input) && (!titleMatch || !faction || !sizeLine || firstSection < 0)) return null
  const detachmentLine = setup.find((line) => /\(\d+ Detachment Points?\)$/i.test(line)) ?? (setup[1] !== sizeLine ? setup[1] : undefined)
  const dispositionLine = setup.find((line) => /^Force Dispositions?:/i.test(line))
  const units: TextRosterUnit[] = []
  let current: TextRosterUnit | null = null
  let unitSection = false
  const unread: string[] = []

  for (const line of lines.slice(factionAt + 1)) {
    const trimmed = line.trim()
    if (/^(Exported with |Codex:|Ruleset:)/i.test(trimmed)) {
      current = null
      continue
    }
    if (sectionHeading.test(trimmed)) {
      current = null
      unitSection = true
      continue
    }
    const header = trimmed.match(unitHeader)
    if (unitSection && header) {
      current = { name: header[1]!.trim(), selections: [], leading: null, warlord: false }
      units.push(current)
      continue
    }
    if (!current) {
      if (unitSection && trimmed) unread.push(trimmed)
      continue
    }
    const picked = line.match(selection)
    if (!picked) {
      if (trimmed) (current.unread ??= []).push(trimmed)
      continue
    }
    const name = picked[2]!.trim()
    const numeric = name.match(/^(Models|Roster entry|Attached to entry):\s*(\d+)$/i)
    if (numeric) {
      const field = { models: 'models', 'roster entry': 'entry', 'attached to entry': 'attachedToEntry' } as const
      current[field[numeric[1]!.toLowerCase() as keyof typeof field]] = Number(numeric[2])
    } else if (/^Nickname:/i.test(name)) (current.unread ??= []).push(trimmed)
    else if (/^Warlord$/i.test(name)) current.warlord = true
    else if (/^(?:Leading|Supporting):/i.test(name)) current.leading = name.replace(/^(?:Leading|Supporting):\s*/i, '').trim()
    else if (/^(?:Leader|Support):/i.test(name)) current.leader = name.replace(/^(?:Leader|Support):\s*/i, '').trim()
    else current.selections.push({ name, count: Number(picked[1] ?? 1) })
  }

  return {
    name: titleMatch?.[1]?.trim() ?? title,
    ...(titleMatch ? { reportedPoints: Number(titleMatch[2]!.replaceAll(',', '')) } : {}),
    faction,
    detachment: detachmentLine && detachmentLine !== 'No detachment' ? detachmentLine.replace(/\s+\(\d+ Detachment Points?\)$/i, '') : null,
    disposition: dispositionLine?.replace(/^Force Dispositions?:\s*/i, '') ?? null,
    limit: sizeLine ? Number(sizeLine.match(/\(([\d,]+) Points?\)$/i)?.[1]?.replaceAll(',', '')) : null,
    units,
    ...(unread.length ? { unread } : {}),
  }
}
