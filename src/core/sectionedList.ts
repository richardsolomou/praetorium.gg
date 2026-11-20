import { GAME_SIZES } from './battleFormat'
import { addCountedPieces, attachGroups, joinGroup, type AttachedGroup, type TextRoster, type TextRosterUnit } from './textRoster'

const detachmentHeading = /^#+\s*D[ée]tachements?\s*:?\s*$/i
const title = /^(.+?)\s+:\s+(.+)$/
const dispositionLine = /^=>\s*Disposition\s*:\s*(.+)$/i
/** "--- Infanterie ---". */
const isSection = (line: string) => line.length >= 5 && line.startsWith('--') && line.endsWith('--')
const tags = /^(?:\[[^\]]+\]\s*)*/
const cost = /:\s*\d+\s*pts?\b/i
const counted = /^\((\d+)\)$/
const warlordTag = /\[\s*Seigneur de guerre\s*\]/i
const total = /^Total\s*:\s*(\d+)\s*points?/i

/**
 * "[Seigneur de guerre] Tétrarque (3) : 85 pts(+20)", where a bracketed tag before the name is a mark or an army's
 * initials. Read in steps: one pattern for the whole line tries every way to share a run of spaces between its parts,
 * which takes minutes on a long line with no cost.
 */
function unitOf(line: string) {
  const tagged = line.match(tags)![0]
  const rest = line.slice(tagged.length)
  // The name is at least one character, so the cost starts after it.
  const at = rest.slice(1).search(cost)
  if (at < 0) return null
  const named = rest.slice(0, at + 1).trimEnd()
  const open = named.lastIndexOf('(')
  const models = open > 0 ? named.slice(open).match(counted)?.[1] : undefined
  return { tags: tagged, name: models ? named.slice(0, open).trimEnd() : named, models: models ? Number(models) : null }
}

/**
 * A list layout French events publish: its army and name on the first line, a "### Détachements :" heading over
 * bulleted detachments, then units under "--- Infanterie ---" sections as "Custodiens Allarus (3) : 165 pts", each
 * followed by "- " lines of wargear. A "- Model : wargear" line is that model's, and a "- [Detachment] name" line an
 * enhancement; a line indented with "|" is a leader attached to the unit above it. Names are French, as the official
 * app prints them, which the importer matches through the catalogue's translations.
 */
export function fromSectionedListText(input: string): TextRoster | null {
  const lines = input
    .replaceAll('\r', '')
    .split('\n')
    .map((line) => line.trim())
  const at = lines.findIndex((line) => detachmentHeading.test(line))
  const titled = lines.find(Boolean)?.match(title)
  if (at < 0 || !titled) return null

  const detachments: string[] = []
  let disposition: string | null = null
  const units: TextRosterUnit[] = []
  const groups: AttachedGroup[] = []
  const unread: string[] = []
  let host: TextRosterUnit | null = null
  let current: TextRosterUnit | null = null
  for (const raw of lines.slice(at + 1)) {
    const attached = raw.startsWith('|')
    const line = raw.replace(/^\|\s*/, '')
    if (!line || isSection(line) || total.test(line)) continue
    const bullet = line.match(/^\*\s*(.+)$/)?.[1]
    if (bullet && !units.length) {
      // Each names its army first, as "Adeptus Custodes - Lions de l'Empereur".
      detachments.push(bullet.replace(/^[^-]+ - /, ''))
      continue
    }
    const stated = line.match(dispositionLine)?.[1]
    if (stated) {
      disposition = stated.trim()
      continue
    }
    if (/^Seigneur de guerre$/i.test(line)) {
      if (current) current.warlord = true
      continue
    }
    const piece = line.match(/^-\s*(.+)$/)?.[1]
    if (piece && current) {
      const enhancement = piece.match(/^\[[^\]]+\]\s*(.+)$/)?.[1]
      const model = piece.match(/^([^:]+?)\s*:\s*(.+)$/)
      if (enhancement) current.selections.push({ name: `Enhancements: ${enhancement.trim()}`, count: 1 })
      else if (model && (model[2]!.includes(',') || model[2]!.split(/\s+/).length <= 4)) {
        const name = model[1]!.trim()
        current.selections.push({ name, count: 1 })
        for (const item of model[2]!
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean))
          current.selections.push({ name: item, count: 1, model: name })
      } else if (model) (current.unread ??= []).push(line)
      else
        addCountedPieces(
          current,
          piece.split(',').map((part) => part.trim()),
        )
      continue
    }
    const unit = unitOf(line)
    if (unit) {
      current = {
        name: unit.name,
        selections: [],
        leading: null,
        warlord: warlordTag.test(unit.tags),
        ...(unit.models ? { models: unit.models } : {}),
      }
      units.push(current)
      if (attached && host) joinGroup(groups, host, current)
      else if (!attached) host = current
      continue
    }
    unread.push(line)
  }
  attachGroups(units, groups)

  const points = Number(lines.find((line) => total.test(line))?.match(total)?.[1]) || null
  return {
    name: titled[2]!.trim(),
    faction: titled[1]!.trim(),
    detachment: detachments.length ? detachments.join(', ') : null,
    disposition,
    // The list's own points, so the battle size is the smallest that holds them.
    limit: points && (GAME_SIZES.find((size) => size.limit >= points)?.limit ?? points),
    ...(points ? { reportedPoints: points } : {}),
    units,
    ...(unread.length ? { unread } : {}),
  }
}
