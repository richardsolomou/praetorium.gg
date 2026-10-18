import { attachGroups, type TextRoster, type TextRosterUnit } from './textRoster'

const title = /^(.+) \((\d[\d,]*) Points?\)$/i
const heading = /^([A-Za-z][A-Za-z '’-]*):$/
const unitHeader = /^(.+?)\s+\((\d[\d,]*) pts\)$/i
const bullet = /^\s*•\s*(?:(\d+)x\s+)?(.+?)\s*$/

/**
 * ListForge's detailed text export.
 *
 * Its first line names the list, faction, force disposition and detachments, as
 * "Name - Faction - Disposition - Detachments (995 Points)".
 */
export function fromListForgeText(input: string): TextRoster | null {
  const lines = input.replaceAll('\r', '').split('\n')
  const at = lines.findIndex((line) => line.trim())
  const titled = lines[at]?.trim().match(title)
  const parts = titled ? titled[1]!.split(' - ') : []
  if (!titled || parts.length < 3) return null
  const body = readBody(lines.slice(at + 1))
  if (!body) return null
  const disposed = parts.length > 3
  return {
    name: parts.slice(0, disposed ? -3 : -2).join(' - '),
    reportedPoints: Number(titled[2]!.replaceAll(',', '')),
    faction: parts.at(disposed ? -3 : -2)!,
    detachment: parts.at(-1)!,
    disposition: disposed ? parts.at(-2)! : null,
    limit: null,
    ...body,
  }
}

/** ListForge's WTC text export, which states the list's setup between two lines of plus signs. */
export function fromListForgeWtcText(input: string): TextRoster | null {
  const lines = input.replaceAll('\r', '').split('\n')
  const field = (name: string) => {
    const pattern = new RegExp(`^${name}:\\s*(.*)$`, 'i')
    const value = lines.map((line) => line.trim().match(pattern)?.[1]?.trim()).find((found) => found !== undefined)
    return value === undefined || /^none$/i.test(value) ? null : value
  }
  const faction = field('Factions Used')?.split(',')[0]?.trim()
  const fence = lines.findLastIndex((line) => /^\+{10,}$/.test(line.trim()))
  if (fence < 0 || !faction || !lines.some((line) => /^List Name:/i.test(line.trim()))) return null
  const body = readBody(lines.slice(fence + 1))
  if (!body) return null
  const points = field('Army Points')?.match(/^\d[\d,]*/)?.[0]
  return {
    name: field('List Name') ?? 'Imported list',
    ...(points ? { reportedPoints: Number(points.replaceAll(',', '')) } : {}),
    faction,
    detachment: field('Detachment\\(s\\)'),
    disposition: field('Disposition'),
    limit: null,
    ...body,
  }
}

/**
 * The unit sections both layouts share: a heading ending in a colon, a unit's name and
 * points, and its models and wargear as bullets nested by indentation.
 *
 * An attached unit is a "Leader + Bodyguard (pts)" line over its members, indented, with
 * the bodyguard last.
 */
function readBody(lines: readonly string[]): Pick<TextRoster, 'units' | 'unread'> | null {
  const units: TextRosterUnit[] = []
  const unread: string[] = []
  const groups: { leaders: TextRosterUnit[]; bodyguard: TextRosterUnit }[] = []
  let headings = 0
  let attached = false
  let members: TextRosterUnit[] | null = null
  let current: TextRosterUnit | null = null
  const close = () => {
    if (members && members.length > 1) groups.push({ leaders: members.slice(0, -1), bodyguard: members.at(-1)! })
    members = null
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const indented = /^\s/.test(line)
    const section = indented ? null : trimmed.match(heading)
    if (section) {
      close()
      headings++
      attached = /^attached units?$/i.test(section[1]!)
      current = null
      continue
    }
    const item = line.match(bullet)
    if (item) {
      if (current) addItem(current, item[2]!, Number(item[1] ?? 1))
      else unread.push(trimmed)
      continue
    }
    const header = trimmed.match(unitHeader)
    if (header && attached && !indented) {
      close()
      members = []
      current = null
      continue
    }
    if (header) {
      current = { name: header[1]!.trim(), selections: [], leading: null, warlord: false }
      units.push(current)
      members?.push(current)
      continue
    }
    if (current) (current.unread ??= []).push(trimmed)
    else unread.push(trimmed)
  }
  close()

  if (!headings || !units.length) return null
  attachGroups(units, groups)
  return { units, ...(unread.length ? { unread } : {}) }
}

function addItem(unit: TextRosterUnit, name: string, count: number) {
  if (/^Warlord$/i.test(name)) {
    unit.warlord = true
    return
  }
  const enhancement = name.match(/^(?:E|Enhancement):\s*(.+?)(?:\s*\(\+\d[\d,]*\s*pts\))?$/i)
  unit.selections.push(enhancement ? { name: `Enhancement: ${enhancement[1]}`, count: 1 } : { name, count })
}
