import { type GwTextRoster, rosterSections } from './gwText'
import { attachGroups, type TextRoster, type TextRosterUnit } from './textRoster'

const title = /^(.+) \((\d[\d,]*) Points?\)$/i
// Allies sit under their faction, as "Allies: Imperial Agents:".
const heading = /^([A-Za-z][A-Za-z '’-]*(?:: [A-Za-z][A-Za-z '’-]*)?):$/
const battleSize = /^Battle Size:\s*(.+?)\s*\((\d[\d,]*) points? limit\)$/i
const forceDisposition = /^Force Disposition:\s*(.+)$/i
const unitHeader = /^(.+?)\s+\((\d[\d,]*) pts\)$/i
const bullet = /^\s*•\s*(?:(\d+)x\s+)?(.+?)\s*$/
const sections = {
  character: 'Characters',
  battleline: 'Battleline',
  transport: 'Dedicated Transports',
  other: 'Other Datasheets',
} as const

/**
 * ListForge's detailed text export.
 *
 * Its first line names the list, faction, force disposition and detachments, as
 * "Name - Faction - Disposition - Detachments (995 Points)". Warmind's version leaves the
 * disposition out of that line and states it, with the battle size, on lines of its own.
 */
export function fromListForgeText(input: string): TextRoster | null {
  const lines = input.replaceAll('\r', '').split('\n')
  const at = lines.findIndex((line) => line.trim())
  const titled = lines[at]?.trim().match(title)
  const parts = titled ? titled[1]!.split(' - ') : []
  if (!titled || parts.length < 3) return null
  const rest = lines.slice(at + 1)
  const first = Math.max(
    0,
    rest.findIndex((line) => heading.test(line)),
  )
  const setup = rest.slice(0, first).flatMap((line) => line.trim() || [])
  const body = readBody(rest.slice(first))
  if (!body) return null
  const size = setup.map((line) => line.match(battleSize)).find(Boolean)
  const disposed = parts.length > 3
  const unread = [...setup.filter((line) => !battleSize.test(line) && !forceDisposition.test(line)), ...(body.unread ?? [])]
  return {
    name: parts.slice(0, disposed ? -3 : -2).join(' - '),
    reportedPoints: Number(titled[2]!.replaceAll(',', '')),
    faction: parts.at(disposed ? -3 : -2)!,
    detachment: /^no detachment$/i.test(parts.at(-1)!) ? null : parts.at(-1)!,
    disposition: setup.map((line) => line.match(forceDisposition)?.[1]).find(Boolean) ?? (disposed ? parts.at(-2)! : null),
    limit: size ? Number(size[2]!.replaceAll(',', '')) : null,
    ...(size ? { sizeName: size[1]! } : {}),
    units: body.units,
    ...(unread.length ? { unread } : {}),
  }
}

/**
 * A roster in ListForge's detailed layout, which `fromListForgeText` reads back.
 *
 * The layout names no battle size or model count, and has no place for the rules version.
 */
export function toListForgeText(roster: GwTextRoster) {
  const setup = [
    roster.name,
    roster.faction,
    ...(roster.dispositions.length ? [roster.dispositions.join(', ')] : []),
    roster.detachments.map((detachment) => detachment.name).join(', ') || 'No detachment',
  ]
  const lines = [`${setup.join(' - ')} (${roster.points} Points)`]
  const { groups, sections: unattached } = rosterSections(roster.units)
  if (groups.length) lines.push('', 'Attached Units:')
  for (const { leaders, bodyguard } of groups) {
    const members = [...leaders, bodyguard]
    const points = members.reduce((total, unit) => total + unit.points, 0)
    lines.push(`${members.map((unit) => unit.name).join(' + ')} (${points} pts)`)
    for (const unit of members) lines.push(`  ${unit.name} (${unit.points} pts)`, ...listForgeItems(unit, '    '))
  }
  for (const { group, units } of unattached) {
    if (!units.length) continue
    lines.push('', `${sections[group]}:`)
    for (const unit of units) lines.push(`${unit.name} (${unit.points} pts)`, ...listForgeItems(unit, '  '))
  }
  return `${lines.join('\n')}\n`
}

function listForgeItems(unit: GwTextRoster['units'][number], indent: string) {
  return [
    ...(unit.warlord ? ['Warlord'] : []),
    ...unit.wargear.map((item) => (item.count === 1 ? item.name : `${item.count}x ${item.name}`)),
    ...unit.enhancements.map((name) => `E: ${name}`),
    ...unit.upgrades.map((name) => `E: ${name} (Upgrade)`),
  ].map((item) => `${indent}• ${item}`)
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
  // Warmind lists a unit's wargear on one line, as "B: 2x Splinter Cannon, Bladevanes".
  const combined = name.match(/^B:\s*(.+)$/)
  if (combined) {
    for (const item of combined[1]!.split(/,\s+/)) {
      const counted = item.match(/^(\d+)x\s+(.+)$/)
      unit.selections.push({ name: counted?.[2] ?? item, count: Number(counted?.[1] ?? 1) })
    }
    return
  }
  const enhancement = name.match(/^(?:E|Enhancement):\s*(.+?)(?:\s*\(\+\d[\d,]*\s*pts\))?$/i)
  unit.selections.push(enhancement ? { name: `Enhancement: ${enhancement[1]}`, count: 1 } : { name, count })
}
