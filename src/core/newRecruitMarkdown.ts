import { newRecruitUnits } from './newRecruit'
import { printedNumber } from './text'
import type { TextRoster } from './textRoster'

const unitLine = /^(.+?)\s+\[(\d[\d,]*)\s*pts?\](?::\s*(.*))?$/i
const bullet = /^[•*]\s*/
const cost = /\s*\[\d[\d,]*\s*pts?\]/gi

/**
 * New Recruit's Markdown export: a "# ++ Army Roster ++" heading over a "## Configuration" block, then units as
 * "Name [80 pts]: wargear" with any models on "• 6x Model: wargear" lines beneath. Its units read as the compact
 * layout's, which states each unit's models in its header rather than leaving them to its model lines.
 */
export function fromNewRecruitMarkdown(input: string): TextRoster | null {
  const lines = input
    .replaceAll('\r', '')
    .split('\n')
    .map((line) => line.trim())
  if (!lines.some((line) => /^#\s*\+\+\s*Army Roster\s*\+\+/i.test(line))) return null
  const field = (label: string) =>
    lines.map((line) => line.match(new RegExp(`^${label}(?:\\s*\\[[^\\]]*\\])?:\\s*(.+)$`, 'i'))?.[1]).find(Boolean) ?? null

  // The title is "<faction> - <list name> - [1995 pts]", where the faction's own name is hyphenated the same way.
  const title = lines.find(Boolean)?.match(/^(.+?)\s+-\s+\[(\d[\d,]*)\s*pts?\]$/i)
  const segments = title?.[1]!.split(' - ') ?? []
  const size = field('Battle Size')?.match(/^(.+?)\s*\((\d[\d,]*)\s*points?\s*limit\)$/i)

  const titleAt = lines.findIndex(Boolean)
  const body: string[] = []
  for (const [at, line] of lines.entries()) {
    if (at === titleAt || !line || line.startsWith('#') || /^Show\/Hide Options$/i.test(line)) continue
    // A bodyguard's "Leader:" and "Supported by:" repeat what its character's own line states.
    if (/^[•*]\s*(?:Leader|Supported by):/i.test(line)) continue
    const relation = line.match(/^[•*]\s*(Leading|Supporting):\s*(.+)$/i)
    if (relation) {
      body.push(`${relation[1]} ${relation[2]}`)
      continue
    }
    if (bullet.test(line)) {
      body.push(line.replace(cost, ''))
      continue
    }
    const unit = line.match(unitLine)
    if (!unit) continue
    let models = 0
    for (let next = at + 1; next < lines.length && bullet.test(lines[next]!); next++)
      models += Number(lines[next]!.match(/^[•*]\s*(\d+)x\s/)?.[1] ?? 0)
    const details = unit[3]?.replace(cost, '').trim()
    body.push(`${models || 1}x ${unit[1]} (${unit[2]} pts)${details ? `: ${details}` : ''}`)
  }
  const units = newRecruitUnits(body)
  if (!units.length || segments.length < 2) return null

  return {
    name: segments.at(-1)!,
    ...(title ? { reportedPoints: printedNumber(title[2]!) } : {}),
    faction: segments.slice(0, -1).join(' - '),
    detachment:
      field('Detachment')
        ?.replace(cost, '')
        .replaceAll(/\s*\[[^\]]*\]/g, '') ?? null,
    disposition: field('Force Disposition'),
    limit: size ? printedNumber(size[2]!) : null,
    ...(size ? { sizeName: size[1]! } : {}),
    units,
  }
}
