import { GAME_SIZES } from './battle'
import { fromBattleBaseText } from './battlebase'
import { printedNumber } from './text'
import { defaultListName, type TextRoster, type TextRosterUnit } from './textRoster'
import { addItems, fromWtcText } from './wtcText'

const footer = /^(?:```\w*|(?:App: \S+ \| )?Data: v\d+|Created with Warscribe\b.*|(?:https?:\/\/)?40k\.warscribe\.app\/?)$/i
const frame = /^═{3,}$/
const section = /^[A-Z][A-Z -]*[A-Z](?: ·{2,} [\d,]+)?$/
const dottedUnit = /^(.+?)(?: \((\d+) models?\))? ·{2,} [\d,]+(\s+★ Warlord)?$/
const pricedUnit = /^(.+?) \([\d,]+ points\)(?: \[(\d+) models?\])?$/

/** A Warscribe share link names its detachments and wargear by Warscribe's private ids, so only its text export can be read. */
export const isWarscribeLink = (input: string) => /^(?:https?:\/\/)?(?:[\w-]+\.)?warscribe\.app(?:[/?#]\S*)?$/i.test(input.trim())

/**
 * Warscribe's text exports.
 *
 * It now writes the official app's layout ("GW") and a WTC layout ("Compact"), both over a "Data: v995" footer, and can wrap
 * either in a code block for Discord. Older versions sign a footer "App: v2026.10.02 | Data: v995" and also wrote a framed
 * layout of dotted price lines and a bulleted one, whose units print a size and put a loadout on one comma-separated line.
 */
export function fromWarscribeText(input: string): TextRoster | null {
  if (!/Created with Warscribe/i.test(input)) return null
  const lines = input.replaceAll('\r', '').split('\n')
  const dataVersion = lines.map((line) => line.trim().match(/\bData: v(\d+)$/)?.[1]).find(Boolean)
  const older = lines.some((line) => line.trim().startsWith('App: '))
  const kept = lines.filter((line) => !footer.test(line.trim()))
  const parsed = kept.some((line) => line.trim().startsWith('+ FACTION KEYWORD:'))
    ? fromCompact(kept)
    : kept.some((line) => frame.test(line.trim()))
      ? fromFramed(kept.map((line) => line.trim()))
      : older
        ? fromBulleted(kept.map((line) => line.trim()))
        : fromGw(kept)
  return parsed && { ...parsed, ...(dataVersion ? { dataVersion: Number(dataVersion) } : {}) }
}

function fromCompact(lines: readonly string[]) {
  const text = lines.map((line) => line.replace(/\s*\[Led by: [^\]]+\]$/, '').replace(/^(\s*)Leading: /, '$1Leading ')).join('\n')
  const parsed = fromWtcText(text)
  const title = lines
    .find((line) => line.trim())
    ?.trim()
    .match(/^(.+?) \([\d,]+ Points\)$/)?.[1]
  const header = (name: string) => lines.map((line) => line.trim().match(new RegExp(`^\\+ ${name}:\\s*(.+)$`))?.[1]).find(Boolean)
  const size = GAME_SIZES.find((candidate) => candidate.name === header('BATTLE SIZE'))
  const chapter = header('CHAPTER')
  return (
    parsed && {
      ...parsed,
      ...(title ? { name: title } : {}),
      ...(chapter ? { faction: chapter } : {}),
      ...(size ? { limit: size.limit, sizeName: size.name } : {}),
    }
  )
}

/**
 * Each kind of model in a unit heads its wargear with a counted line, which says the size outright. A squad's line can name
 * a model the catalogue spells differently, but a lone model's can be the option that fields it, so only the former is dropped.
 * Without such lines the models are alike, and one holding two of a weapon shows as uneven counts.
 */
function fromGw(lines: readonly string[]): TextRoster | null {
  const parsed = fromBattleBaseText(lines.join('\n'))
  // Where no line is nested, the shared reader takes one weapon over another for a model and its wargear.
  const nested = lines.some((line) => line.trim().startsWith('◦'))
  for (const unit of parsed?.units ?? []) {
    if (!nested) for (const selection of unit.selections) delete selection.model
    const heads = new Set(unit.selections.flatMap((selection) => selection.model ?? []))
    const isHead = (selection: TextRosterUnit['selections'][number]) => !selection.model && heads.has(selection.name)
    const counts = unit.selections.map((selection) => selection.count)
    const headed = unit.selections.filter(isHead).reduce((total, selection) => total + selection.count, 0)
    if (headed) unit.models = headed
    else if (Math.min(...counts) < Math.max(...counts)) unit.models = Math.min(...counts)
    unit.selections = unit.selections.filter((selection) => !isHead(selection) || selection.count === 1)
  }
  return parsed
}

function fromFramed(lines: readonly string[]): TextRoster | null {
  const opening = lines.findIndex((line) => frame.test(line))
  const closing = lines.findIndex((line, at) => at > opening && frame.test(line))
  const setup = lines.slice(opening + 1, closing).filter(Boolean)
  const points = setup.map((line) => line.match(/^([\d,]+) \/ ([\d,]+) pts\b/)).find(Boolean)
  const faction = setup[0]
  if (closing < 0 || !points || !faction) return null
  const body = lines.slice(closing + 1).filter((line) => !/^(?:─{3,}|TOTAL \d.*)$/.test(line))
  const detachments = setup.find((line) => /\(\d+ DP\)/.test(line))
  const reportedPoints = printedNumber(points[1]!)
  return withUnits(body, dottedUnit, {
    name: defaultListName(faction, reportedPoints),
    faction,
    detachment: detachments?.replace(/\s*\(\d+ DP\)/g, '').replaceAll(' · ', ', ') ?? null,
    disposition: null,
    limit: printedNumber(points[2]!),
    reportedPoints,
  })
}

function fromBulleted(lines: readonly string[]): TextRoster | null {
  const firstSection = lines.findIndex((line) => section.test(line))
  const setup = lines.slice(0, firstSection).filter(Boolean)
  const [title, faction, ...rest] = setup
  const total = title?.match(pricedUnit)
  if (firstSection < 0 || !total || !faction) return null
  const detachment = rest.find((line) => /\(\d+ Detachment Points?\)$/.test(line))
  const size = rest.find((line) => line !== detachment && pricedUnit.test(line))?.match(/^(.+?) \(([\d,]+) points\)$/)
  const reported = title!.match(/\(([\d,]+) points\)/)![1]!
  return withUnits(lines.slice(firstSection), pricedUnit, {
    name: total[1]!,
    faction,
    detachment: detachment?.replace(/\s*\(\d+ Detachment Points?\)$/, '') ?? null,
    disposition: rest.map((line) => line.match(/^Force Dispositions?:\s*(.+)$/)?.[1]).find(Boolean) ?? null,
    limit: size ? printedNumber(size[2]!) : null,
    ...(size ? { sizeName: size[1]! } : {}),
    reportedPoints: printedNumber(reported),
  })
}

/** Reads units from a layout whose header gives the name, then the model count when above one, then a Warlord mark. */
function withUnits(lines: readonly string[], unitLine: RegExp, setup: Omit<TextRoster, 'units'>): TextRoster | null {
  const units: TextRosterUnit[] = []
  const unread: string[] = []
  let current: TextRosterUnit | null = null
  for (const line of lines) {
    if (!line) continue
    if (section.test(line)) {
      current = null
      continue
    }
    const unit = line.match(unitLine)
    if (unit) {
      current = { name: unit[1]!.trim(), models: Number(unit[2] ?? 1), selections: [], leading: null, warlord: Boolean(unit[3]) }
      units.push(current)
      continue
    }
    if (!current) {
      unread.push(line)
      continue
    }
    const detail = line.replace(/^•\s*/, '')
    const leading = detail.match(/^Leading:\s*(.+)$/)
    if (leading) current.leading = leading[1]!.trim()
    else if (/^Warlord$/i.test(detail)) current.warlord = true
    else addItems(current, detail)
  }
  if (!units.length) return null
  return { ...setup, units, ...(unread.length ? { unread } : {}) }
}
