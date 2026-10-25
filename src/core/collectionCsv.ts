import { countsAsList, MAX_COLLECTION_DATASHEETS, MAX_COLLECTION_MODELS, MAX_COUNTS_AS, type CollectionEntry } from './collection'

/** A collection file is a few hundred kilobytes at the datasheet limit; anything far larger is not one. */
export const MAX_COLLECTION_CSV_BYTES = 1_000_000

const COLLECTION_CSV_COLUMNS = ['faction', 'datasheet', 'datasheet_id', 'models', 'built', 'painted', 'wanted', 'counts_as_ids'] as const

/** Separates the datasheet ids in `counts_as_ids`, which a comma would split into cells. */
const LINK_SEPARATOR = ';'

type Sheet = { id: string; name: string; faction: string }

export type CollectionCsvRow = {
  entryId: string
  name: string
  faction: string
} & CollectionEntry

/** Spreadsheet applications run a cell that starts with one of these as a formula. */
const FORMULA = /^[=+\-@\t\r]/

function cell(value: string | number) {
  const text = typeof value === 'number' ? String(value) : FORMULA.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function collectionCsv(rows: readonly CollectionCsvRow[]) {
  const lines = rows
    .toSorted((a, b) => a.faction.localeCompare(b.faction) || a.name.localeCompare(b.name))
    .map((row) =>
      [row.faction, row.name, row.entryId, row.models, row.built, row.painted, row.wanted, (row.countsAs ?? []).join(LINK_SEPARATOR)]
        .map(cell)
        .join(','),
    )
  return [COLLECTION_CSV_COLUMNS.join(','), ...lines].join('\r\n') + '\r\n'
}

/** RFC 4180 records; a quote inside an unquoted field is kept as text. */
export function parseCsv(text: string) {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0
  for (; index < text.length; index++) {
    const char = text[index]!
    if (quoted) {
      if (char !== '"') field += char
      else if (text[index + 1] === '"') {
        field += '"'
        index++
      } else quoted = false
    } else if (char === '"' && field === '') quoted = true
    else if (char === ',') {
      record.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else field += char
  }
  if (field !== '' || record.length) records.push([...record, field])
  return records.filter((row) => row.some((value) => value.trim() !== ''))
}

const normalise = (value: string) => value.trim().replace(/^'/, '').replaceAll(/\s+/g, ' ').toLocaleLowerCase('en')

export type ImportedRow = { line: number; name: string } & (
  | ({ status: 'recognised'; entryId: string } & CollectionEntry)
  | ({ status: 'ambiguous'; candidates: Sheet[] } & CollectionEntry)
  | { status: 'unmatched' | 'duplicate' | 'invalid'; reason: string }
)

export type CollectionImport = { rows: ImportedRow[] } | { error: string }

function count(raw: string | undefined) {
  const text = raw?.trim() ?? ''
  if (text === '') return 0
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  return value <= MAX_COLLECTION_MODELS ? value : null
}

/** Reads a collection file against the current datasheets without touching anything saved. */
export function readCollectionCsv(text: string, sheets: readonly Sheet[]): CollectionImport {
  if (new TextEncoder().encode(text).length > MAX_COLLECTION_CSV_BYTES) return { error: 'This file is larger than a collection can be.' }
  const [header, ...records] = parseCsv(text)
  if (!header) return { error: 'This file is empty.' }
  const columns = new Map(header.map((name, index) => [normalise(name).replaceAll(' ', '_'), index]))
  if (!columns.has('datasheet') && !columns.has('datasheet_id'))
    return { error: 'The first row must name the columns, including datasheet or datasheet_id.' }
  if (records.length > MAX_COLLECTION_DATASHEETS)
    return { error: `A collection holds up to ${MAX_COLLECTION_DATASHEETS.toLocaleString('en')} datasheets.` }
  const byId = new Map(sheets.map((sheet) => [sheet.id, sheet]))
  const byName = new Map<string, Sheet[]>()
  for (const sheet of byId.values()) byName.set(normalise(sheet.name), [...(byName.get(normalise(sheet.name)) ?? []), sheet])
  const value = (record: string[], column: string) => {
    const index = columns.get(column)
    return index === undefined ? undefined : record[index]
  }
  const seen = new Set<string>()
  const rows = records.map((record, index): ImportedRow => {
    const line = index + 2
    const id = value(record, 'datasheet_id')?.trim() ?? ''
    const name = value(record, 'datasheet')?.trim().replace(/^'/, '') || id
    const counts = {
      models: count(value(record, 'models')),
      built: count(value(record, 'built')),
      painted: count(value(record, 'painted')),
      wanted: count(value(record, 'wanted')),
    }
    if (counts.models === null || counts.built === null || counts.painted === null || counts.wanted === null)
      return {
        line,
        name,
        status: 'invalid',
        reason: `Counts must be whole numbers from 0 to ${MAX_COLLECTION_MODELS.toLocaleString('en')}.`,
      }
    const valid = { models: counts.models, built: counts.built, painted: counts.painted, wanted: counts.wanted }
    if (valid.built > valid.models || valid.painted > valid.built)
      return { line, name, status: 'invalid', reason: 'Painted cannot exceed built, and built cannot exceed models.' }
    if (!valid.models && !valid.wanted) return { line, name, status: 'invalid', reason: 'Neither models nor wanted is above zero.' }
    // Links name current datasheets by id; one the current rules lack is dropped, as an unmatched row is.
    const links = (value(record, 'counts_as_ids') ?? '')
      .split(LINK_SEPARATOR)
      .map((link) => link.trim())
      .filter((link) => byId.has(link))
    if (links.length > MAX_COUNTS_AS)
      return { line, name, status: 'invalid', reason: `A datasheet's models can be up to ${MAX_COUNTS_AS} other datasheets.` }
    if (links.length && !valid.models) return { line, name, status: 'invalid', reason: 'Only owned models can also be other datasheets.' }
    const faction = normalise(value(record, 'faction') ?? '')
    const named = byName.get(normalise(name)) ?? []
    const candidates = byId.has(id)
      ? [byId.get(id)!]
      : faction && named.some((sheet) => normalise(sheet.faction) === faction)
        ? named.filter((sheet) => normalise(sheet.faction) === faction)
        : named
    if (!candidates.length) return { line, name, status: 'unmatched', reason: 'No current datasheet has this name.' }
    const linked = links.length ? { countsAs: links } : {}
    if (candidates.length > 1) return { line, name, status: 'ambiguous', candidates, ...valid, ...linked }
    const entryId = candidates[0]!.id
    if (seen.has(entryId)) return { line, name, status: 'duplicate', reason: 'An earlier row already lists this datasheet.' }
    seen.add(entryId)
    const countsAs = countsAsList(entryId, links)
    return { line, name: candidates[0]!.name, status: 'recognised', entryId, ...valid, ...(countsAs.length ? { countsAs } : {}) }
  })
  return { rows }
}

export type ImportChange = 'new' | 'same' | 'conflict'

/** Import only adds or raises what a row lists: a zero or no links leaves the saved value alone, and nothing is removed. */
export function importChange(row: CollectionEntry, current: CollectionEntry | undefined): ImportChange {
  if (!current || (!current.models && !current.wanted)) return 'new'
  const links = row.models ? (row.countsAs ?? []) : []
  const relinked = links.length > 0 && JSON.stringify(links) !== JSON.stringify(current.countsAs ?? [])
  const counted = row.models > 0 && (row.models !== current.models || row.built !== current.built || row.painted !== current.painted)
  const wanted = row.wanted > 0 && row.wanted !== current.wanted
  if (current.models && (counted || (relinked && current.countsAs?.length))) return 'conflict'
  if (wanted && current.wanted) return 'conflict'
  return counted || relinked || wanted ? 'new' : 'same'
}
