import { attachGroups, textNote, type TextRoster, type TextRosterUnit } from './textRoster'
import { printedNumber } from './text'

const total = /^(\d[\d,]*)\/(\d[\d,]*) pts$/
const priced = /^(.+?) \[\d[\d,]* pts\]$/
const unitLine = /^(.+?) \[\d[\d,]* pts\](?: \((\d+) models?\))?( - Warlord)?$/
const counted = /^(\d+)×\s*(.+)$/
const italic = /^\*(.+)\*$/

/**
 * 40k.app's text export, with or without its attached units grouped.
 *
 * Above the first section sit the list name, then "Faction · Detachment · Detachment", the
 * mission its disposition plays, and "980/1000 pts". A heading the line before which is blank
 * names a section, or, where the list has allies, the army whose sections follow. A unit is
 * "Name [pts] (3 models)", lettered "A", "B" where it is taken twice; a leader or support names
 * its bodyguard on an "Attached to" line, or the grouped layout lists them in an "ATTACHED UNIT"
 * section ahead of their bodyguard. Its Markdown exports say the same, so they are read as text.
 */
export function fromFortyKAppText(input: string): TextRoster | null {
  const lines = textLines(input.replaceAll('\r', '').split('\n'))
  const first = lines.findIndex((line, at) => priced.test(line.trim()) && !lines[at - 1]?.trim())
  if (first < 0) return null
  const header = lines.slice(0, first).flatMap((line) => line.trim() || [])
  const factionLine = header.findLastIndex((line) => line.includes(' · '))
  const points = header.map((line) => line.match(total)).find(Boolean)
  if (factionLine < 0 || !points) return null
  const [faction, ...detachments] = header[factionLine]!.split(' · ')
  const mission = header.map((line) => line.match(/^Mission:\s*(.+)$/)?.[1]).find(Boolean) ?? null
  const unread = header.filter((line, at) => at !== 0 && at !== factionLine && !total.test(line) && !line.startsWith('Mission:'))

  const units: { label: string; unit: TextRosterUnit; attachedTo?: string; armed?: boolean; notes: string[] }[] = []
  const grouped: (typeof units)[] = []
  let group: typeof units | null = null
  let current: (typeof units)[number] | null = null
  for (const [at, line] of lines.entries()) {
    if (at < first) continue
    const trimmed = line.trim()
    if (trimmed.startsWith('Exported from 40k.app')) break
    if (!trimmed) continue
    const unit = trimmed.match(unitLine)
    if (!lines[at - 1]?.trim() || (!unit && priced.test(trimmed))) {
      // A section, or an army heading where the list has allies.
      group = /^ATTACHED UNIT\b/i.test(trimmed) ? [] : null
      if (group) grouped.push(group)
      current = null
      continue
    }
    if (unit) {
      current = {
        label: unit[1]!,
        unit: {
          name: unit[1]!,
          models: unit[2] ? Number(unit[2]) : null,
          // It prints no count for a lone model, nor for a character's fixed retinue, as Canis Rex's Sir Hekhtur.
          ...(unit[2] ? {} : { defaultSize: true }),
          selections: [],
          leading: null,
          warlord: !!unit[3],
        },
        notes: [],
      }
      units.push(current)
      group?.push(current)
      continue
    }
    if (!current) {
      unread.push(trimmed)
      continue
    }
    const attached = trimmed.match(/^Attached to (.+)$/)
    const noted = trimmed.match(italic)
    const enhancement = trimmed.match(/^(Enhancement|Upgrade):\s*(.+?)(?:\s*\(\+\d[\d,]*\s*pts\))?$/)
    if (noted) current.notes.push(noted[1]!)
    else if (attached) current.attachedTo = attached[1]!
    else if (enhancement) current.unit.selections.push({ name: `${enhancement[1]}: ${enhancement[2]}`, count: 1 })
    else if (/^(?:Led|Supported) by /.test(trimmed)) continue
    // A unit's wargear is one line; any after it are the player's own notes.
    else if (current.armed) current.notes.push(trimmed)
    else {
      current.unit.selections.push(...loadout(trimmed, current.unit.models ?? 1))
      current.armed = true
      // With its default gear hidden, a unit carrying only that prints its note where its wargear would be.
      if (!/ \/ | \+ |×/.test(trimmed)) current.unit.noteOrWargear = trimmed
    }
  }

  for (const entry of units) {
    const note = textNote(entry.notes)
    if (note) entry.unit.note = note
  }
  // A unit taken more than once is lettered, except where the grouped layout lists it under its leader.
  const bases = units.map(({ label }) => label.match(/^(.+) [A-Z]$/)?.[1] ?? label)
  for (const [at, entry] of units.entries()) {
    if (bases[at] !== entry.label && bases.filter((base) => base === bases[at]).length > 1) entry.unit.name = bases[at]!
  }
  const byLabel = new Map(units.map((entry) => [entry.label, entry]))
  const bodyguards = new Map<(typeof units)[number], TextRosterUnit[]>()
  for (const entry of units) {
    const bodyguard = entry.attachedTo === undefined ? undefined : byLabel.get(entry.attachedTo)
    if (bodyguard) bodyguards.set(bodyguard, [...(bodyguards.get(bodyguard) ?? []), entry.unit])
    else if (entry.attachedTo !== undefined) entry.unit.leading = entry.attachedTo
  }
  for (const members of grouped) {
    const bodyguard = members.at(-1)
    if (bodyguard && members.length > 1)
      bodyguards.set(
        bodyguard,
        members.slice(0, -1).map((member) => member.unit),
      )
  }
  attachGroups(
    units.map((entry) => entry.unit),
    [...bodyguards].map(([bodyguard, leaders]) => ({ leaders, bodyguard: bodyguard.unit })),
  )

  return {
    name: header[0]!,
    reportedPoints: printedNumber(points[1]!),
    faction: faction!,
    detachment: detachments.join(', ') || null,
    disposition: mission,
    limit: printedNumber(points[2]!),
    units: units.map((entry) => entry.unit),
    ...(unread.length ? { unread } : {}),
  }
}

/**
 * A Markdown export as the text one: a "#" heading or table header row for each section, a
 * bold name for each unit with its details as bullets or further table rows, and notes in italics.
 */
function textLines(lines: readonly string[]) {
  const start = lines.findIndex((line) => line.trim())
  if (!lines[start]?.startsWith('# ')) return lines
  const out: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    const heading = line.match(/^#+ (.+)$/)
    const cells = line.startsWith('|')
      ? line
          .slice(1, -1)
          .split('|')
          .map((cell) => cell.trim())
      : null
    if (line.startsWith('*Exported from [40k.app]')) break
    if (heading && out.length) out.push('', heading[1]!)
    else if (heading) out.push(heading[1]!)
    else if (cells) {
      if (cells.every((cell) => /^:?-+:?$/.test(cell) || !cell)) continue
      const [name = '', detail = ''] = cells
      const section = name.match(/^\*\*(.+)\*\* (\[\d[\d,]* pts\])$/)
      const unit = name.match(/^\*\*(.+)\*\* \((\d[\d,]*) pts(?:, (\d+ models?))?\)(?: — (Warlord))?$/)
      if (section) out.push('', `${section[1]} ${section[2]}`)
      else if (unit) out.push(`${unit[1]} [${unit[2]} pts]${unit[3] ? ` (${unit[3]})` : ''}${unit[4] ? ' - Warlord' : ''}`)
      if (!section && detail) out.push(detail.replaceAll('**', ''))
    } else if (line.startsWith('- ')) out.push(line.slice(2).replace(/^\*\*(.+?)\*\*/, '$1'))
    else if (/^\*\*.+\*\* \[/.test(line)) out.push(line.replace(/^\*\*(.+?)\*\*/, '$1'))
    else if (line) out.push(line.replaceAll('**', ''))
  }
  return out
}

/**
 * One wargear line: loadouts split by "/", the items of each joined by "+".
 *
 * A count before a loadout is how many models carry all of it, as "3× Spear + Shield" on a squad;
 * on a lone model, or where it exceeds the squad, it counts only the item it precedes.
 */
function loadout(line: string, models: number) {
  return line.split(' / ').flatMap((part) => {
    const lead = part.match(counted)
    const carriers = lead && models > 1 && Number(lead[1]) <= models ? Number(lead[1]) : 1
    const items = (carriers > 1 ? lead![2]! : part).split(' + ')
    return items.map((item) => {
      const own = item.match(counted)
      return { name: (own?.[2] ?? item).trim(), count: carriers * Number(own?.[1] ?? 1) }
    })
  })
}
