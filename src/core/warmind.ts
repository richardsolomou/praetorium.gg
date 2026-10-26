import { attachGroups, type TextRoster, type TextRosterUnit } from './textRoster'
import { printedNumber } from './text'

const rule = /^─{10,}$/
const unitLine = /^(?:└\s*(?:Leads|Supports):\s*)?(.+?)(?:\s+×(\d+))?(?:\s+\((\d[\d,]*) pts\))?((?:\s+·\s+[^·]+)*)$/

/**
 * Warmind's own text export, in English.
 *
 * The setup sits between the list name and a rule line; each unit names its model count as
 * "×5", and its wargear on one "·" line. An attached unit's leaders come first, followed by
 * its bodyguard on an indented "└ Leads:" line.
 */
export function fromWarmindText(input: string): TextRoster | null {
  if (!/^(?:Built with Warmind|Exported with Praetorium\.gg)\b/m.test(input)) return null
  const lines = input.replaceAll('\r', '').split('\n')
  const opening = lines.findIndex((line) => rule.test(line.trim()))
  if (opening < 0) return null
  const closing = lines.findIndex((line, at) => at > opening && rule.test(line.trim()))
  const blank = lines.findIndex((line, at) => at > opening && !line.trim())
  const setupEnd = blank < 0 ? lines.length : blank
  const setup = lines.slice(opening + 1, setupEnd).map((line) => line.trim())
  const field = (name: string) =>
    setup
      .find((line) => line.startsWith(`${name}:`))
      ?.slice(name.length + 1)
      .trim() ?? null
  const faction = field('Faction')
  if (!faction) return null
  const size = field('Battle Size')?.match(/^(.+?)\s*\((\d[\d,]*) pts\)/)
  const total = field('Total')?.match(/^(\d[\d,]*)\s*\//)?.[1]

  const units: TextRosterUnit[] = []
  const unread = setup.filter((line) => !/^(?:Faction|Detachment|Battle Size|Total|Disposition):/.test(line) && line !== 'Battle Ready')
  const groups: { leaders: TextRosterUnit[]; bodyguard: TextRosterUnit }[] = []
  let leaders: TextRosterUnit[] = []
  let current: TextRosterUnit | null = null
  let added = false

  for (const line of lines.slice(setupEnd, closing < 0 ? undefined : closing)) {
    const trimmed = line.trim()
    if (!trimmed) {
      leaders = []
      current = null
      continue
    }
    if (!/^\s/.test(line) && !/[a-z]/.test(trimmed)) {
      // Units brought in during a battle are not part of the list.
      added = trimmed === 'ADDED IN BATTLE'
      leaders = []
      current = null
      continue
    }
    if (added) {
      unread.push(trimmed)
      continue
    }
    const loadout = trimmed.match(/^·\s*(.+)$/)
    if (loadout) {
      if (current) addLoadout(current, loadout[1]!)
      else unread.push(trimmed)
      continue
    }
    const unit = trimmed.match(unitLine)!
    current = {
      name: unit[1]!.trim(),
      models: Number(unit[2] ?? 1),
      selections: [],
      leading: null,
      warlord: /·\s*Warlord\b/.test(unit[4] ?? ''),
    }
    units.push(current)
    if (trimmed.startsWith('└')) {
      groups.push({ leaders, bodyguard: current })
      leaders = []
    } else leaders.push(current)
  }
  attachGroups(units, groups)

  return {
    name: lines.find((line) => line.trim())!.trim(),
    ...(total ? { reportedPoints: printedNumber(total) } : {}),
    faction,
    detachment: field('Detachment'),
    disposition: field('Disposition'),
    limit: size ? printedNumber(size[2]!) : null,
    ...(size ? { sizeName: size[1]! } : {}),
    units,
    ...(unread.length ? { unread } : {}),
  }
}

function addLoadout(unit: TextRosterUnit, text: string) {
  const priced = text.match(/^(Enhancement|Upgrade):\s*(.+?)(?:\s*\(\+\d[\d,]*\s*pts\))?$/)
  if (priced) {
    unit.selections.push({ name: `${priced[1]}: ${priced[2]}`, count: 1 })
    return
  }
  const leads = text.match(/^(?:Leads|Supports):\s*(.+)$/)
  if (leads) {
    unit.leading = leads[1]!.trim()
    return
  }
  for (const item of text.split(/,\s+/)) {
    const counted = item.match(/^(\d+)×\s*(.+)$/)
    unit.selections.push({ name: (counted?.[2] ?? item).trim(), count: Number(counted?.[1] ?? 1) })
  }
}
