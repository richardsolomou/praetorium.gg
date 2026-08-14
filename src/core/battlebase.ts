/** A BattleBase plain-text export, reduced to facts the catalogue can resolve. */
export type BattleBaseRoster = {
  name: string
  faction: string
  detachment: string | null
  disposition: string | null
  limit: number | null
  units: BattleBaseUnit[]
}

export type BattleBaseUnit = {
  name: string
  selections: { name: string; count: number }[]
  leading: string | null
  warlord: boolean
}

const unitHeader = /^(.*?)\s+\(\d[\d,]* Points?\)$/i
const selection = /^\s*•\s*(?:(\d+)x\s+)?(.+?)\s*$/

/**
 * BattleBase's clipboard export is deliberately human-readable. Section names
 * may grow over time, so unit headers and indented bullets are the grammar; an
 * all-caps line merely ends the preceding unit.
 */
export function fromBattleBaseText(input: string): BattleBaseRoster | null {
  if (!/Exported with BattleBase/i.test(input)) return null
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
  const units: BattleBaseUnit[] = []
  let current: BattleBaseUnit | null = null

  for (const line of lines.slice(factionAt + 1)) {
    const trimmed = line.trim()
    const header = trimmed.match(unitHeader)
    if (header && !/Detachment Points?\)$/i.test(trimmed) && !/^(Combat Patrol|Incursion|Strike Force|Onslaught)\b/i.test(trimmed)) {
      current = { name: header[1].trim(), selections: [], leading: null, warlord: false }
      units.push(current)
      continue
    }
    if (!current) continue
    const picked = line.match(selection)
    if (!picked) {
      if (trimmed && trimmed === trimmed.toUpperCase()) current = null
      continue
    }
    const name = picked[2].trim()
    if (/^Warlord$/i.test(name)) current.warlord = true
    else if (/^Leading:/i.test(name)) current.leading = name.replace(/^Leading:\s*/i, '').trim()
    else if (!/^Leader:/i.test(name)) current.selections.push({ name, count: Number(picked[1] ?? 1) })
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
