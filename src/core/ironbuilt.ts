import { attachGroups, type TextRoster, type TextRosterUnit } from './textRoster'
import { printedNumber } from './text'

const frame = /^\+={10,}$/
const total = /^(\d[\d,]*) \/ (\d[\d,]*) pts · \d+ units?$/
const unitLine = /^(.+?)( \[WARLORD\])? \[(\d[\d,]*) pts\]$/
const groupLine = /^-{2,}Attached Unit [A-Z]+ \[\d[\d,]* pts\]-*$/

/**
 * Ironbuilt's text export.
 *
 * A frame of "+===" lines holds "Name — Faction", the detachments as "Kauyon (2DP) + Experimental Prototype Cadre (1DP)",
 * the force disposition, and "1995 / 2000 pts · 21 units". Each attached unit is a "----Attached Unit A [195 pts]----"
 * group whose leaders end with "↳ Attached to:" over the bodyguard. A unit names its models as "2x Crisis Sunforge Shas’ui",
 * then its whole loadout on "Weapons:" and "Wargear:" lines, as "Fusion blaster x6".
 */
export function fromIronbuiltText(input: string): TextRoster | null {
  const lines = input
    .replaceAll('\r', '')
    .split('\n')
    .map((line) => line.trim())
  const opening = lines.findIndex(Boolean)
  if (!frame.test(lines[opening] ?? '')) return null
  const closing = lines.findIndex((line, at) => at > opening && frame.test(line))
  const setup = lines.slice(opening + 1, closing).filter(Boolean)
  const points = setup.map((line) => line.match(total)).find(Boolean)
  const titled = setup[0]?.match(/^(.*) — (.+)$/)
  if (closing < 0 || !points || !titled) return null
  const detachments = setup.find((line) => /\(\d+DP\)/.test(line))

  const units: TextRosterUnit[] = []
  const unread: string[] = []
  const groups: { leaders: TextRosterUnit[]; bodyguard: TextRosterUnit }[] = []
  let group: TextRosterUnit[] | null = null
  let leading = false
  let current: TextRosterUnit | null = null
  const close = () => {
    if (group && group.length > 1) groups.push({ leaders: group.slice(0, -1), bodyguard: group.at(-1)! })
    group = null
  }

  for (const line of lines.slice(closing + 1)) {
    if (!line || /^Total: \d/.test(line) || /^https?:\/\//.test(line)) continue
    if (/^── .+ ─+$/.test(line)) {
      close()
      current = null
      continue
    }
    if (groupLine.test(line)) {
      close()
      group = []
      current = null
      continue
    }
    if (line === '↳ Attached to:') {
      leading = true
      continue
    }
    const unit = line.match(unitLine)
    if (unit) {
      // A unit that no "↳ Attached to:" led into ends its group.
      if (group && group.length && !leading) close()
      leading = false
      current = { name: unit[1]!.trim(), selections: [], leading: null, warlord: Boolean(unit[2]) }
      units.push(current)
      group?.push(current)
      continue
    }
    if (current) addLine(current, line)
    else unread.push(line)
  }
  close()
  if (!units.length) return null
  attachGroups(units, groups)

  return {
    name: titled[1]!.trim() || 'Imported list',
    faction: titled[2]!.trim(),
    detachment: detachments
      ? detachments
          .split(' + ')
          .map((name) => name.replace(/\s*\(\d+DP\)$/, ''))
          .join(', ')
      : null,
    disposition: setup.map((line) => line.match(/^Force Disposition:\s*(.+)$/)?.[1]).find(Boolean) ?? null,
    reportedPoints: printedNumber(points[1]!),
    limit: printedNumber(points[2]!),
    units,
    ...(unread.length ? { unread } : {}),
  }
}

function addLine(unit: TextRosterUnit, line: string) {
  const models = line.match(/^(\d+)x\s+(.+)$/)
  if (models) {
    unit.selections.push({ name: models[2]!, count: Number(models[1]) })
    return
  }
  const enhancement = line.match(/^Enhancement:\s*(.+?)(?:\s*\(\+\d[\d,]*\))?$/)
  if (enhancement) {
    unit.selections.push({ name: `Enhancement: ${enhancement[1]}`, count: 1 })
    return
  }
  const items = line.match(/^(?:Weapons|Wargear|Upgrade):\s*(.+)$/)
  if (!items) {
    ;(unit.unread ??= []).push(line)
    return
  }
  const profiled = new Set<string>()
  for (const item of items[1]!.split(/,\s+/)) {
    const [, piece, count] = item.match(/^(.+?)(?: x(\d+))?$/)!
    // A weapon with several profiles prints each, as "➤ Dawn Blade - strike, ➤ Dawn Blade - sweep".
    const profile = piece!.match(/^➤\s*(.+?) - [^-]+$/)
    if (profile && profiled.has(profile[1]!)) continue
    if (profile) profiled.add(profile[1]!)
    unit.selections.push({ name: profile?.[1] ?? piece!, count: Number(count ?? 1) })
  }
}
