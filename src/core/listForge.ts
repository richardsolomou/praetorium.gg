import { attachGroups, type TextRoster, type TextRosterUnit } from './textRoster'
import { printedNumber } from './text'

const title = /^(.+) \((\d[\d,]*) Points?\)$/i
// Allies sit under their faction, as "Allies: Imperial Agents:".
const heading = /^([A-Za-z][A-Za-z '’-]*(?:: [A-Za-z][A-Za-z '’-]*)?):$/
const battleSize = /^Battle Size:\s*(.+?)\s*\((\d[\d,]*) points? limit\)$/i
const forceDisposition = /^Force Disposition:\s*(.+)$/i
const unitHeader = /^(.+?)\s+\((\d[\d,]*) pts\)$/i
const bullet = /^\s*•\s*(?:(\d+)x\s+)?(.+?)\s*$/
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
    reportedPoints: printedNumber(titled[2]!),
    faction: parts.at(disposed ? -3 : -2)!,
    detachment: /^no detachment$/i.test(parts.at(-1)!) ? null : parts.at(-1)!,
    disposition: setup.map((line) => line.match(forceDisposition)?.[1]).find(Boolean) ?? (disposed ? parts.at(-2)! : null),
    limit: size ? printedNumber(size[2]!) : null,
    ...(size ? { sizeName: size[1]! } : {}),
    units: body.units,
    ...(unread.length ? { unread } : {}),
  }
}

/**
 * ListForge's short text export: the detailed export's title, then one line for each unit or attached group, as
 * "Leader: gear, E: Enhancement + Bodyguard: 4x Model (340 pts)". The models a unit fields are among its items, and
 * "2x Unit:" is two of that unit.
 */
export function fromListForgeShortText(input: string): TextRoster | null {
  const lines = input
    .replaceAll('\r', '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const titled = lines[0]?.match(title)
  const parts = titled ? titled[1]!.split(' - ') : []
  // Some versions group the lines under headings, as "Attached Units:".
  const body = lines.slice(1).filter((line) => !heading.test(line))
  if (!titled || parts.length < 3 || !body.length || !body.every((line) => unitHeader.test(line) && /^[^:(]+: /.test(line))) return null
  const disposed = parts.length > 3
  const units: TextRosterUnit[] = []
  const groups: { leaders: TextRosterUnit[]; bodyguard: TextRosterUnit }[] = []
  for (const line of body) {
    const members = line
      .match(unitHeader)![1]!
      .split(' + ')
      .map((member) => {
        const [, copies, name, items] = member.match(/^(?:(\d+)x\s+)?([^:]+?)(?::\s*(.*))?$/)!
        const unit: TextRosterUnit = { name: name!.trim(), selections: [], leading: null, warlord: false }
        // A comma inside brackets is part of the item, as "Drakolithe (Once per battle, per token)".
        for (const item of items?.split(/,\s+(?![^()]*\))/) ?? []) {
          // A counted model's own wargear can follow it in brackets, as "6x Kataphron Destroyer (Kataphron plasma culverin &
          // Cognis flamer)"; other brackets qualify the item, as "Furious Assault (Upgrade)".
          const [, count, piece, carried] = item.match(/^(\d+)x\s+(.+?)\s+\(([^()]+)\)$/) ?? item.match(/^(?:(\d+)x\s+)?(.+)$/)!
          addItem(unit, piece!, Number(count ?? 1))
          for (const held of carried?.split(/\s+&\s+/) ?? []) addItem(unit, held, Number(count ?? 1), piece)
        }
        return { unit, copies: Number(copies ?? 1) }
      })
    for (const { unit, copies } of members) for (let copy = 0; copy < copies; copy++) units.push(copy ? structuredClone(unit) : unit)
    if (members.length > 1) groups.push({ leaders: members.slice(0, -1).map(({ unit }) => unit), bodyguard: members.at(-1)!.unit })
  }
  attachGroups(units, groups)
  return {
    name: parts.slice(0, disposed ? -3 : -2).join(' - '),
    reportedPoints: printedNumber(titled[2]!),
    faction: parts.at(disposed ? -3 : -2)!,
    detachment: !parts.at(-1)!.trim() || /^no detachment$/i.test(parts.at(-1)!) ? null : parts.at(-1)!,
    disposition: disposed ? parts.at(-2)! : null,
    limit: null,
    units,
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
    ...(points ? { reportedPoints: printedNumber(points) } : {}),
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
 * An attached unit is a "Leader + Bodyguard (pts)" line over its members, with the bodyguard
 * last. The members are usually indented, but a paste can lose that, so the group's line is
 * the one naming its units with " + ".
 */
function readBody(lines: readonly string[]): Pick<TextRoster, 'units' | 'unread'> | null {
  const units: TextRosterUnit[] = []
  const unread: string[] = []
  const groups: { leaders: TextRosterUnit[]; bodyguard: TextRosterUnit }[] = []
  let headings = 0
  let attached = false
  let members: TextRosterUnit[] | null = null
  let current: TextRosterUnit | null = null
  // The shallowest bullet of a unit names a model or a piece of its wargear; deeper ones belong to it.
  let top: { indent: number; name: string } | null = null
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
      const indent = line.length - line.trimStart().length
      const nested = top !== null && indent > top.indent
      if (!nested) top = { indent, name: item[2]! }
      if (current) addItem(current, item[2]!, Number(item[1] ?? 1), nested ? top!.name : undefined)
      else unread.push(trimmed)
      continue
    }
    const header = trimmed.match(unitHeader)
    if (header && attached && / \+ /.test(header[1]!)) {
      close()
      members = []
      current = null
      continue
    }
    if (header) {
      top = null
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

function addItem(unit: TextRosterUnit, name: string, count: number, model?: string) {
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
  unit.selections.push({
    ...(enhancement ? { name: `Enhancement: ${enhancement[1]}`, count: 1 } : { name, count }),
    ...(model ? { model } : {}),
  })
}
