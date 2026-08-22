import type { TextRoster, TextRosterUnit } from './textRoster'
import { GAME_SIZES } from './battle'

const unitHeader = /^(?:Char\d+:\s*)?(\d+)x\s+(.+?)\s+\(\d[\d,]*\s*pts?\)(?::\s*(.*))?$/i
const modelLine = /^[•*]\s*(\d+)x\s+([^:]+?)(?::\s*(.*))?$/

export function fromNewRecruitText(input: string): TextRoster | null {
  if (!/Created with newrecruit\.eu/i.test(input)) return null

  const lines = input.replaceAll('\r', '').split('\n')
  const faction = metadata(lines, 'FACTION KEYWORD') ?? ''
  const detachment = metadata(lines, 'DETACHMENT')?.replace(/\s+\([^()]+\)\s*$/, '') ?? null
  const disposition = metadata(lines, 'FORCE DISPOSITION')
  const points = metadata(lines, 'TOTAL ARMY POINTS')?.match(/([\d,]+)\s*pts?/i)?.[1]
  const total = points ? Number(points.replaceAll(',', '')) : null
  const limit = total === null ? null : (GAME_SIZES.find((size) => size.limit >= total)?.limit ?? total)
  const warlord = metadata(lines, 'WARLORD')?.replace(/^Char\d+:\s*/i, '') ?? null
  const units: TextRosterUnit[] = []
  let current: TextRosterUnit | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    const header = trimmed.match(unitHeader)
    if (header) {
      current = {
        name: header[2]!.trim(),
        models: Number(header[1]!),
        selections: [],
        leading: null,
        leader: null,
        warlord: false,
      }
      addDetails(current, header[3] ?? '', 1)
      units.push(current)
      continue
    }
    if (!current) continue

    const leading = trimmed.match(/^Leading\s+(.+)$/i)
    if (leading) {
      current.leading = relationName(leading[1]!)
      continue
    }
    const attached = trimmed.match(/^Attached to\s+(.+)$/i)
    if (attached) {
      current.leader = relationName(attached[1]!)
      continue
    }
    const enhancement = trimmed.match(/^Enhancement:\s*(.+)$/i)
    if (enhancement) {
      const name = enhancement[1]!.replace(/\s+\([+-]?\d+\s*pts?\)\s*$/i, '').trim()
      addSelection(current, `Enhancement: ${name}`, 1)
      continue
    }
    const model = trimmed.match(modelLine)
    if (model) {
      const count = Number(model[1]!)
      addSelection(current, model[2]!, count)
      addDetails(current, model[3] ?? '', count)
      continue
    }
    const nested = trimmed.match(/^(\d+)\s+with\s+(.+)$/i)
    if (nested) addDetails(current, nested[2]!, Number(nested[1]!))
  }

  if (warlord) {
    const unit = units.find((candidate) => normalized(candidate.name) === normalized(warlord))
    if (unit) unit.warlord = true
  }

  const factionName = faction.split(' - ').at(-1)?.trim() || 'Imported roster'
  return {
    name: total === null ? `${factionName} roster` : `${factionName} ${total}pts`,
    faction,
    detachment,
    disposition,
    limit,
    units,
  }
}

function metadata(lines: readonly string[], name: string) {
  const prefix = new RegExp(`^\\+\\s*${name}:\\s*(.+)$`, 'i')
  return lines.map((line) => line.trim().match(prefix)?.[1]?.trim().replace(/\s+/g, ' ')).find(Boolean) ?? null
}

const relationName = (value: string) => value.trim().replace(/\[\d+\]$/, '')

function addDetails(unit: TextRosterUnit, details: string, defaultMultiplier: number) {
  let rest = details.trim()
  let multiplier = defaultMultiplier
  const grouped = rest.match(/^(\d+)\s+with\s+(.+)$/i)
  if (grouped) {
    multiplier = Number(grouped[1]!)
    rest = grouped[2]!
  }

  for (const raw of rest.split(',')) {
    const item = raw.trim().replace(/\s+\([+-]?\d+\s*pts?\)\s*$/i, '')
    if (!item) continue
    if (/^Warlord$/i.test(item)) {
      unit.warlord = true
      continue
    }
    const counted = item.match(/^(\d+)x\s+(.+)$/i)
    addSelection(unit, counted?.[2] ?? item, Number(counted?.[1] ?? 1) * multiplier)
  }
}

function addSelection(unit: TextRosterUnit, name: string, count: number) {
  const clean = name.trim()
  const existing = unit.selections.find((selection) => normalized(selection.name) === normalized(clean))
  if (existing) existing.count += count
  else unit.selections.push({ name: clean, count })
}

const normalized = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[’‘]/g, "'")
