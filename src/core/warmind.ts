import { type GwTextRoster, headings, rosterSections } from './gwText'
import { attachGroups, type TextRoster, type TextRosterUnit } from './textRoster'

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
    ...(total ? { reportedPoints: Number(total.replaceAll(',', '')) } : {}),
    faction,
    detachment: field('Detachment'),
    disposition: field('Disposition'),
    limit: size ? Number(size[2]!.replaceAll(',', '')) : null,
    ...(size ? { sizeName: size[1]! } : {}),
    units,
    ...(unread.length ? { unread } : {}),
  }
}

/**
 * A roster in Warmind's layout, which `fromWarmindText` reads back.
 *
 * Each section lists its attached units first: a bodyguard's "└ Leads:" line closes the
 * group above it, so a unit listed before it would join that group.
 */
export function toWarmindText(roster: GwTextRoster, version: string) {
  const divider = '─'.repeat(30)
  const budget = roster.pointsBudget ?? roster.limit
  const detachments = roster.detachments.map((detachment) => detachment.name).join(', ')
  const lines = [
    roster.name,
    divider,
    `Faction: ${roster.faction}`,
    ...(detachments ? [`Detachment: ${detachments}`] : []),
    `Battle Size: ${roster.size} (${budget} pts)`,
    `Total: ${roster.points} / ${budget} pts`,
    ...(roster.dispositions.length ? [`Disposition: ${roster.dispositions.join(', ')}`] : []),
  ]
  const { groups, sections } = rosterSections(roster.units)
  for (const { group, units } of sections) {
    const section: string[] = []
    for (const { leaders, bodyguard } of groups) {
      if (leaders[0]!.group !== group) continue
      const leads = leaders.some((leader) => leader.joined.some((row) => row.label === 'Leading'))
      for (const leader of leaders) section.push(...warmindUnit(leader, '', '   '))
      section.push(...warmindUnit(bodyguard, `   └ ${leads ? 'Leads' : 'Supports'}: `, '      '))
    }
    for (const unit of units) section.push(...warmindUnit(unit, '', '   '))
    if (section.length) lines.push('', headings[group], ...section)
  }
  lines.push(
    '',
    divider,
    `${roster.points} / ${budget} pts · ${roster.units.length} units · ${roster.size}`,
    `Exported with Praetorium.gg v${version}`,
  )
  return `${lines.join('\n')}\n`
}

function warmindUnit(unit: GwTextRoster['units'][number], prefix: string, indent: string) {
  const models = unit.models !== undefined && unit.models > 1 ? ` ×${unit.models}` : ''
  return [
    `${prefix}${unit.name}${models} (${unit.points} pts)${unit.warlord ? ' · Warlord' : ''}`,
    ...unit.wargear.map((item) => `${indent}· ${item.count === 1 ? '' : `${item.count}× `}${item.name}`),
    ...unit.enhancements.map((name) => `${indent}· Enhancement: ${name}`),
    ...unit.upgrades.map((name) => `${indent}· Upgrade: ${name}`),
  ]
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
