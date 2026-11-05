import { printedNumber } from './text'
import { textNickname, type TextRoster, type TextRosterUnit } from './textRoster'

const battleSize = /^Battle Size:\s*(.+?)\s*\((\d[\d,]*) points? limit\)$/i
const detachments = /^Detachments?:\s*(.+?)(?:\s*\([^()]*\))?$/i
const disposition = /^Force Dispositions?:\s*(.+)$/i
const title = /^(.*?)\s*\[(\d[\d,]*) points?\]$/i
const unitLine = /^(.+?)(?:\s+\[([^\]]+)\])?\s+\((\d[\d,]*) points?\)$/i
const modelLine = /^(\d+)\s+(.+?)\s+with\s+(.+)$/i
const enhancement = /^(.+?)\s*\[\+\d[\d,]*\s*points?\]$/i

/**
 * WarOrgan's text: a title priced "[2000 points]", the faction, labelled setup lines, then units under headings.
 *
 * A heading names a role, as "Battleline", or an attached group, as "Attached Unit" or a name the player gave it, and
 * the text does not say which; a group lists its units alphabetically, so it does not say which is the bodyguard either.
 * Each heading's units are marked as one group for the importer to settle. A line joins a model's wargear with commas
 * and a last "and", and a piece's own name can hold a lower-case "and", as "Hybrid firearm and cult icon".
 */
export function fromWarOrganText(input: string): TextRoster | null {
  const lines = input.replaceAll('\r', '').split('\n')
  const sizeAt = lines.findIndex((line) => battleSize.test(line.trim()))
  const detachmentLine = lines.find((line) => detachments.test(line.trim()))
  if (sizeAt < 1 || !detachmentLine) return null
  const size = lines[sizeAt]!.trim().match(battleSize)!
  const faction = lines[sizeAt - 1]!.trim()
  const named = lines
    .slice(0, sizeAt - 1)
    .find((line) => line.trim())
    ?.trim()
  const priced = named?.match(title)

  const units: TextRosterUnit[] = []
  const unread: string[] = []
  let current: TextRosterUnit | null = null
  let group = 0
  const setupEnd = lines.findIndex((line, at) => at > sizeAt && disposition.test(line.trim()))
  for (const line of lines.slice(Math.max(setupEnd, lines.indexOf(detachmentLine)) + 1)) {
    const trimmed = line.trim()
    if (!trimmed || /^Created with /i.test(trimmed)) continue
    if (!/^\s/.test(line)) {
      group++
      current = null
      continue
    }
    const unit = trimmed.match(unitLine)
    if (unit) {
      current = { name: unit[1]!, selections: [], leading: null, warlord: false, ...(group ? { group } : {}) }
      const nickname = unit[2] && textNickname(unit[2])
      if (nickname) current.nickname = nickname
      units.push(current)
      continue
    }
    const item = trimmed.match(/^•\s*(.+)$/)?.[1]
    if (!current || !item) {
      if (current) (current.unread ??= []).push(trimmed)
      else unread.push(trimmed)
      continue
    }
    if (/^Warlord$/i.test(item)) {
      current.warlord = true
      continue
    }
    const enhanced = item.match(enhancement)
    if (enhanced) {
      current.selections.push({ name: `Enhancements: ${enhanced[1]!}`, count: 1 })
      continue
    }
    const model = item.match(modelLine)
    const count = model ? Number(model[1]) : 1
    if (model) current.selections.push({ name: model[2]!, count })
    for (const piece of pieces(model ? model[3]! : item)) {
      const counted = piece.match(/^(\d+)\s+(.+)$/)
      current.selections.push({
        name: counted?.[2] ?? piece,
        count: count * Number(counted?.[1] ?? 1),
        ...(model ? { model: model[2]! } : {}),
      })
    }
  }

  return {
    name: (priced ? priced[1] : named) || 'Imported list',
    ...(priced ? { reportedPoints: printedNumber(priced[2]!) } : {}),
    faction,
    detachment: detachmentLine.trim().match(detachments)![1]!,
    disposition: setupEnd >= 0 ? lines[setupEnd]!.trim().match(disposition)![1]!.trim() : null,
    limit: printedNumber(size[2]!),
    sizeName: size[1]!,
    units,
    ...(unread.length ? { unread } : {}),
  }
}

/** The pieces a line lists, split at each comma and at each "and" that starts a new, capitalised piece. */
const pieces = (line: string) => line.split(/,\s+|\s+and\s+(?=[\p{Lu}\d])/u).filter(Boolean)
