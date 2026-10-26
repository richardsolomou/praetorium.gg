import { newRecruitUnits } from './newRecruit'
import { plainQuotes, printedNumber } from './text'
import { attachGroups, type TextRoster, type TextRosterUnit, WTC_SECTION } from './textRoster'

const compactHeader = /^(?:Char\d+:\s*)?\d+x\s+.+\(\d[\d,]*\s*pts?\)/i
const unitHeader = /^(.+?)\s+\((\d[\d,]*)\s*(?:pts?|points?)\)$/i
const attachedHeading = /^Attached unit \d+$/i

/**
 * The de facto WTC submission text: a "+ FACTION KEYWORD:" header, then units in either the
 * New Recruit tournament layout ("1x Unit (90 pts): wargear") or the official app's layout
 * ("Unit (90 pts)" over bulleted wargear).
 *
 * The header names a battle size only sometimes; points alone never choose one.
 */
export function fromWtcText(input: string): TextRoster | null {
  const lines = input.replaceAll('\r', '').split('\n')
  const field = (name: string) => {
    const pattern = new RegExp(`^\\+\\s*${name}\\s*:\\s*(.+)$`, 'i')
    return lines.map((line) => line.trim().match(pattern)?.[1]?.trim().replace(/\s+/g, ' ')).find(Boolean) ?? null
  }
  const faction = field('FACTION KEYWORD')
  if (!faction) return null

  const headerEnd = lines.findLastIndex((line) => /^\s*[+&]/.test(line))
  const body = lines.slice(headerEnd + 1)
  const read = body.some((line) => compactHeader.test(line.trim())) ? { units: newRecruitUnits(body), unread: [] } : officialUnits(body)
  const warlord = field('WARLORD')?.replace(/^Char\d+:\s*/i, '')
  if (warlord && !read.units.some((unit) => unit.warlord)) {
    const named = read.units.find((unit) => plainQuotes(unit.name.toLocaleLowerCase()) === plainQuotes(warlord.toLocaleLowerCase()))
    if (named) named.warlord = true
  }

  const points = field('TOTAL ARMY POINTS')?.match(/^(\d[\d,]*)\s*pts?/i)?.[1]
  const reportedPoints = points ? printedNumber(points) : undefined
  const size = battleSize(field('BATTLE SIZE'))
  const detachment = field('DETACHMENT')?.replace(/\s+\([^()]+\)\.?$/, '') ?? null
  const factionName = faction.split(' - ').at(-1)!.trim()
  return {
    name: field('LIST NAME') ?? (reportedPoints === undefined ? `${factionName} roster` : `${factionName} ${reportedPoints}pts`),
    ...(reportedPoints === undefined ? {} : { reportedPoints }),
    faction,
    detachment: detachment === 'No detachment' ? null : detachment,
    disposition: field('FORCE DISPOSITION'),
    limit: size?.limit ?? null,
    ...(size?.name ? { sizeName: size.name } : {}),
    units: read.units,
    ...(read.unread.length ? { unread: read.unread } : {}),
  }
}

/** "Strike Force (2000 point limit)", or "2000pts (Strike Force)", or "2000pts". */
function battleSize(value: string | null) {
  const named = value?.match(/^(.+?)\s*\((\d[\d,]*) points? limit\)$/i)
  if (named) return { name: named[1]!, limit: printedNumber(named[2]!) }
  const numeric = value?.match(/^(\d[\d,]*)\s*pts(?:\s+\((.+)\))?$/i)
  if (numeric) return { name: numeric[2], limit: printedNumber(numeric[1]!) }
  return null
}

/**
 * Units in the official app's layout under WTC section headings.
 *
 * An "Attached Unit 1" group lists its leaders before its bodyguard, which may also say
 * "Attached as: Bodyguard". An enhancement is a bullet priced "(+25 pts)".
 */
function officialUnits(lines: readonly string[]) {
  const units: TextRosterUnit[] = []
  const unread: string[] = []
  const groups: { leaders: TextRosterUnit[]; bodyguard: TextRosterUnit }[] = []
  let group: { members: TextRosterUnit[]; bodyguard: TextRosterUnit | null } | null = null
  let current: TextRosterUnit | null = null
  const close = () => {
    const bodyguard = group?.bodyguard ?? group?.members.at(-1)
    if (group && bodyguard && group.members.length > 1)
      groups.push({ leaders: group.members.filter((member) => member !== bodyguard), bodyguard })
    group = null
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || /^(?:Created with|Exported (?:with|from)) /i.test(trimmed)) continue
    if (attachedHeading.test(trimmed) || WTC_SECTION.test(trimmed)) {
      close()
      if (attachedHeading.test(trimmed)) group = { members: [], bodyguard: null }
      current = null
      continue
    }
    const item = trimmed.match(/^[•◦]\s*(.+)$/)
    if (item && current) {
      if (/^Attached as:\s*Bodyguard\b/i.test(item[1]!)) {
        if (group) group.bodyguard = current
      } else if (/^Warlord$/i.test(item[1]!)) current.warlord = true
      else if (!/^Attached as:/i.test(item[1]!)) addItems(current, item[1]!)
      continue
    }
    const header = item ? null : trimmed.match(unitHeader)
    if (header) {
      current = { name: header[1]!.trim(), selections: [], leading: null, warlord: false }
      units.push(current)
      group?.members.push(current)
      continue
    }
    if (current) (current.unread ??= []).push(trimmed)
    else unread.push(trimmed)
  }
  close()

  attachGroups(units, groups)
  return { units, unread }
}

/** One bullet can name several items, as "2x Gun Drone, 2x Shield Drone". */
function addItems(unit: TextRosterUnit, text: string) {
  for (const part of text.split(/,\s+/)) {
    const item = part.replace(/\s*\(\+\d[\d,]*\s*pts?\)$/i, '').trim()
    const counted = item.match(/^(\d+)x\s+(.+)$/i)
    unit.selections.push({ name: counted?.[2] ?? item, count: Number(counted?.[1] ?? 1) })
  }
}
