import { GAME_SIZES } from './battleFormat'
import { addCountedPieces, attachGroups, joinGroup, type AttachedGroup, type TextRoster, type TextRosterUnit } from './textRoster'

const field = (label: string) => new RegExp(`^${label}\\s*:\\s*(.*)$`, 'i')
const faction = field('Factions utilisées')
const points = field("Points d'armée")
const disposition = field('Disposition')
const detachmentHeading = field('Détachements')
const warlordField = field('Seigneur de guerre')
/** "Infanterie 3 : 10 Véroleux [65pts] wargear", indented with "|" when the unit is attached to the one above. */
const unitLine = /^(\|\s*)?[^\d:|]+?\s\d+\s*:\s*(?:\[(?:Meneur|Appui)\]\s*)?(?:(\d+)\s+)?(.+?)\s*\[\d+\s*pts?\](.*)$/i
const warlordMark = /[[(]\s*Seigneur de guerre\s*[\])]|\bSeigneur de guerre\s*$/i
const enhancement = /^Optimisations?\s*:\s*(.+)$/i
const separator = /^[+-]{6,}$/
const labelled = /^[^:]{2,40}\s:\s?/

/**
 * Mini Headquarters' own list layout, which French events publish: labelled setup lines between rules of plus signs,
 * then one line per unit under a role and number, as "Infanterie 3 : 10 Véroleux [65pts]", with its wargear after the
 * cost or on the next line. A "---" line names a model with its own wargear, or an enhancement as "--- Optimisations :",
 * and a line indented with "|" is a character attached to the unit above it. Names are the French ones the official
 * app prints, which the importer matches through the catalogue's translations.
 */
export function fromMiniHeadquartersText(input: string): TextRoster | null {
  const lines = input
    .replaceAll('\r', '')
    .split('\n')
    .map((line) => line.trim())
  const factionLine = lines.find((line) => faction.test(line))
  if (!factionLine || !lines.some((line) => unitLine.test(line))) return null

  const detachments: string[] = []
  const at = lines.findIndex((line) => detachmentHeading.test(line))
  if (at >= 0) {
    const inline = lines[at]!.match(detachmentHeading)![1]!.trim()
    if (inline) detachments.push(inline)
    for (const line of lines.slice(at + 1)) {
      if (!line) continue
      if (separator.test(line) || labelled.test(line) || unitLine.test(line)) break
      detachments.push(line)
    }
  }

  const units: TextRosterUnit[] = []
  const groups: AttachedGroup[] = []
  const unread: string[] = []
  let host: TextRosterUnit | null = null
  let current: TextRosterUnit | null = null
  const start = Math.max(
    at,
    lines.findIndex((line) => disposition.test(line)),
  )
  for (const raw of lines.slice(start + 1)) {
    const attached = raw.startsWith('|')
    const line = raw.replace(/^\|\s*/, '')
    if (!line || separator.test(line) || detachments.includes(line)) continue
    const unit = raw.match(unitLine)
    if (unit) {
      const rest = unit[4]!
      current = {
        name: unit[3]!.replace(warlordMark, '').trim(),
        selections: [],
        leading: null,
        warlord: warlordMark.test(unit[3]!) || warlordMark.test(rest),
        ...(unit[2] ? { models: Number(unit[2]) } : {}),
      }
      units.push(current)
      if (attached && host) joinGroup(groups, host, current)
      else host = current
      addCountedPieces(current, rest.replace(warlordMark, '').split(',').map(withoutCost))
      continue
    }
    if (!current) continue
    const model = line.match(/^-{2,}\s*(.+)$/)?.[1]
    if (model) {
      const enhanced = model.match(enhancement)
      if (enhanced) current.selections.push({ name: `Enhancements: ${withoutCost(enhanced[1]!)}`, count: 1 })
      else if (!/:/.test(model)) {
        const [name, ...pieces] = model.split(',').map(withoutCost)
        current.selections.push({ name: name!, count: 1 })
        for (const piece of pieces.filter(Boolean)) current.selections.push({ name: piece, count: 1, model: name! })
      } else (current.unread ??= []).push(line)
      continue
    }
    // A counted model with its wargear, as "1 Long Piquant,Fusil Kroot", once the unit's own wargear is read.
    const counted = current.selections.length ? line.match(/^(\d+)x?\s+([^,]+),(.+)$/) : null
    if (counted) {
      const [count, name] = [Number(counted[1]), withoutCost(counted[2]!)]
      current.selections.push({ name, count })
      for (const piece of counted[3]!.split(',').map(withoutCost).filter(Boolean))
        current.selections.push({ name: piece, count, model: name })
      continue
    }
    // Wargear printed on the line below its unit; anything else is a note the player added.
    if (/^\d+\s+\S|^[^\s:]+[^:]*,/.test(line) && !current.selections.length) addCountedPieces(current, line.split(',').map(withoutCost))
    else unread.push(line)
  }
  attachGroups(units, groups)

  const named = lines
    .find((line) => warlordField.test(line))
    ?.match(warlordField)?.[1]
    ?.trim()
  const warlord = named && units.find((unit) => unit.name === named)
  if (warlord && !units.some((unit) => unit.warlord)) warlord.warlord = true

  const armyPoints = Number(lines.find((line) => points.test(line))?.match(points)?.[1]) || null
  return {
    name: 'Imported list',
    faction: factionLine.match(faction)![1]!.trim(),
    // Each detachment names its army first, as "Blood Angels - Groupe d'Assaut Liberator", and can carry its cost.
    detachment: detachments.length
      ? detachments
          .map((name) =>
            name
              .replace(/^[^-]+ - /, '')
              .replace(/^et\s+/i, '')
              .replace(/\s*\(\d+\)$/, ''),
          )
          .join(', ')
      : null,
    disposition:
      lines
        .find((line) => disposition.test(line))
        ?.match(disposition)?.[1]
        ?.trim() || null,
    // The army's points, which a list a few points short prints as they are, so the battle size is the smallest that holds them.
    limit: armyPoints && (GAME_SIZES.find((size) => size.limit >= armyPoints)?.limit ?? armyPoints),
    ...(armyPoints ? { reportedPoints: armyPoints } : {}),
    units,
    ...(unread.length ? { unread } : {}),
  }
}

/** A piece's name without the cost Mini Headquarters prints after it, as "(0)", or a cost cut off at "(0". */
const withoutCost = (piece: string) => piece.replace(/\s*\(\d*\)?\s*$/, '').trim()
