import type { TextRoster, TextRosterUnit } from './textRoster'

const unitHeader = /^(.*?)\s+\(\d[\d,]* Points?\)$/i
const selection = /^\s*•\s*(?:(\d+)x\s+)?(.+?)\s*$/

export function fromBattleBaseText(input: string): TextRoster | null {
  if (!/Exported with (?:BattleBase|Praetorium\.gg)/i.test(input)) return null
  const lines = input.replaceAll('\r', '').split('\n')
  const title = lines.find((line) => line.trim())?.trim() ?? 'Imported list'
  const titleMatch = title.match(/^(.*?)\s+\(\d[\d,]* Points?\)$/i)
  const factionAt = lines.findIndex((line) => line.trim() === title)
  const faction =
    lines
      .slice(factionAt + 1)
      .find((line) => line.trim())
      ?.trim() ?? ''
  const detachmentLine = lines.find((line) => /\(\d+ Detachment Points?\)$/i.test(line.trim()))?.trim()
  const dispositionLine = lines.find((line) => /^Force Dispositions?:/i.test(line.trim()))?.trim()
  const sizeLine = lines.find((line) => /\([\d,]+ Points?\)$/i.test(line.trim()) && line.trim() !== title)?.trim()
  const units: TextRosterUnit[] = []
  let current: TextRosterUnit | null = null
  let unitSection = false

  for (const line of lines.slice(factionAt + 1)) {
    const trimmed = line.trim()
    if (trimmed && trimmed === trimmed.toUpperCase() && !/[():]/.test(trimmed)) {
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
    if (!current) continue
    const picked = line.match(selection)
    if (!picked) continue
    const name = picked[2]!.trim()
    if (/^Warlord$/i.test(name)) current.warlord = true
    else if (/^(?:Leading|Supporting):/i.test(name)) current.leading = name.replace(/^(?:Leading|Supporting):\s*/i, '').trim()
    else if (/^(?:Leader|Support):/i.test(name)) current.leader = name.replace(/^(?:Leader|Support):\s*/i, '').trim()
    else current.selections.push({ name, count: Number(picked[1] ?? 1) })
  }

  return {
    name: titleMatch?.[1]?.trim() ?? title,
    faction,
    detachment: detachmentLine?.replace(/\s+\(\d+ Detachment Points?\)$/i, '') ?? null,
    disposition: dispositionLine?.replace(/^Force Dispositions?:\s*/i, '') ?? null,
    limit: sizeLine ? Number(sizeLine.match(/\(([\d,]+) Points?\)$/i)?.[1]?.replaceAll(',', '')) || null : null,
    units,
  }
}
