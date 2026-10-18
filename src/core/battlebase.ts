import type { TextRoster, TextRosterUnit } from './textRoster'

const unitHeader = /^(.*?)\s+\(\d[\d,]* Points?\)$/i
const selection = /^\s*[•◦]\s*(?:(\d+)x\s+)?(.+?)\s*$/
const titlePattern = /^(.*?)\s+\((\d[\d,]*) Points?(?:;[^)]*)?\)$/i
const sectionHeading = /^(ATTACHED UNITS|CHARACTERS?|BATTLELINE|DEDICATED TRANSPORTS|OTHER DATASHEETS|ALLIED UNITS)$/i

export function fromBattleBaseText(input: string): TextRoster | null {
  const lines = input.replaceAll('\r', '').split('\n')
  const title = lines.find((line) => line.trim())?.trim() ?? 'Imported list'
  const titleMatch = title.match(titlePattern)
  const factionAt = lines.findIndex((line) => line.trim() === title)
  const firstSection = lines.findIndex((line) => sectionHeading.test(line.trim()))
  const setup = lines
    .slice(factionAt + 1, firstSection < 0 ? undefined : firstSection)
    .map((line) => line.trim())
    .filter((line) => line && !/^Warhammer 40,?000$/i.test(line))
  const faction = setup[0] ?? ''
  const sizeLine = setup.find((line) => /\([\d,]+ Points?\)$/i.test(line))
  if (!/Exported with (?:BattleBase|Praetorium\.gg)/i.test(input) && (!titleMatch || !faction || !sizeLine || firstSection < 0)) return null
  // Warmind gives each detachment a line of its own.
  const pricedDetachments = setup.filter((line) => /\(\d+ Detachment Points?\)$/i.test(line))
  // New Recruit writes the disposition alone on the line after a priced detachment.
  const unlabelled = setup.slice(1).filter((line) => line !== sizeLine && !pricedDetachments.includes(line))
  const dispositionLine =
    setup.find((line) => /^Force Dispositions?:/i.test(line)) ??
    (pricedDetachments.length && unlabelled.length === 1 ? unlabelled[0] : undefined)
  const detachmentLine = pricedDetachments.length
    ? pricedDetachments.map((line) => line.replace(/\s+\(\d+ Detachment Points?\)$/i, '')).join(', ')
    : setup.slice(1).find((line) => line !== sizeLine && line !== dispositionLine)
  const size = sizeLine?.match(/^(.*?)\s*\(([\d,]+) Points?\)$/i)
  const units: TextRosterUnit[] = []
  let current: TextRosterUnit | null = null
  let unitSection = false
  const unread: string[] = []
  // New Recruit lists a leader and its bodyguard together under "Attached unit N".
  type AttachedGroup = { leaders: TextRosterUnit[]; bodyguards: TextRosterUnit[] }
  let attachedGroup: AttachedGroup | null = null
  const attachedGroups: AttachedGroup[] = []

  for (const line of lines.slice(factionAt + 1)) {
    const trimmed = line.trim()
    if (/^(Exported with |Codex:|Ruleset:|TOTAL ARMY POINTS:)/i.test(trimmed)) {
      current = null
      continue
    }
    if (sectionHeading.test(trimmed)) {
      current = null
      attachedGroup = null
      unitSection = true
      continue
    }
    if (unitSection && /^Attached unit \d+$/i.test(trimmed)) {
      current = null
      attachedGroup = { leaders: [], bodyguards: [] }
      attachedGroups.push(attachedGroup)
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
    const modelCount = name.match(/^(\d+) models?$/i)
    if (modelCount) current.models = Number(modelCount[1])
    else if (numeric) {
      const field = { models: 'models', 'roster entry': 'entry', 'attached to entry': 'attachedToEntry' } as const
      current[field[numeric[1]!.toLowerCase() as keyof typeof field]] = Number(numeric[2])
    } else if (/^Nickname:/i.test(name)) (current.unread ??= []).push(trimmed)
    else if (/^Warlord$/i.test(name)) current.warlord = true
    else if (/^(?:Leading|Supporting):/i.test(name)) current.leading = name.replace(/^(?:Leading|Supporting):\s*/i, '').trim()
    else if (/^(?:Leader|Support):/i.test(name)) current.leader = name.replace(/^(?:Leader|Support):\s*/i, '').trim()
    else if (attachedGroup && /^Attached as:\s*Leader\b/i.test(name)) attachedGroup.leaders.push(current)
    else if (attachedGroup && /^Attached as:\s*Bodyguard\b/i.test(name)) attachedGroup.bodyguards.push(current)
    else current.selections.push({ name, count: Number(picked[1] ?? 1) })
  }

  // Entries the text never numbers itself, so they cannot collide with ones it does.
  let entry = Math.max(0, ...units.map((unit) => unit.entry ?? 0))
  for (const { leaders, bodyguards } of attachedGroups) {
    if (bodyguards.length !== 1) continue
    bodyguards[0]!.entry = ++entry
    for (const leader of leaders) leader.attachedToEntry = entry
  }

  return {
    name: titleMatch?.[1]?.trim() ?? title,
    ...(titleMatch ? { reportedPoints: Number(titleMatch[2]!.replaceAll(',', '')) } : {}),
    faction,
    detachment: detachmentLine && detachmentLine !== 'No detachment' ? detachmentLine.replace(/\s+\(\d+ Detachment Points?\)$/i, '') : null,
    disposition: dispositionLine?.replace(/^Force Dispositions?:\s*/i, '') ?? null,
    limit: size ? Number(size[2]!.replaceAll(',', '')) : null,
    ...(size?.[1] ? { sizeName: size[1] } : {}),
    units,
    ...(unread.length ? { unread } : {}),
  }
}
