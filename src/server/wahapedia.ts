import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import { compile } from 'html-to-text'
import { routeSlug } from '../core/slug'

export const WAHAPEDIA_ATTRIBUTION = 'Descriptions provided by Wahapedia'

type ExportRow = { name: string; detachment?: string; description?: string }

export type WahapediaDescriptions = {
  enhancements: ReadonlyMap<string, string>
  stratagems: ReadonlyMap<string, string>
}

const toText = compile({
  wordwrap: false,
  selectors: [
    { selector: 'a', options: { ignoreHref: true } },
    { selector: 'img', format: 'skip' },
  ],
})

export function loadWahapediaDescriptions(directory: string): WahapediaDescriptions | null {
  const enhancements = readDescriptions(path.join(directory, 'Enhancements.csv'))
  const stratagems = readDescriptions(path.join(directory, 'Stratagems.csv'))
  return enhancements.size || stratagems.size ? { enhancements, stratagems } : null
}

export const descriptionKey = (detachment: string, name: string) => `${routeSlug(detachment)}|${routeSlug(name)}`

function readDescriptions(file: string): Map<string, string> {
  if (!fs.existsSync(file)) return new Map()
  const rows = parse<ExportRow>(fs.readFileSync(file, 'utf8'), {
    bom: true,
    columns: true,
    delimiter: '|',
    quote: false,
    relax_column_count: true,
    skip_empty_lines: true,
  })
  const candidates = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!row.name || !row.description) continue
    const description = toText(row.description).trim()
    if (!description) continue
    const key = descriptionKey(row.detachment ?? '', row.name)
    const existing = candidates.get(key) ?? new Set<string>()
    existing.add(description)
    candidates.set(key, existing)
  }
  return new Map(
    [...candidates]
      .filter(([, descriptions]) => descriptions.size === 1)
      .map(([key, descriptions]) => [key, descriptions.values().next().value!]),
  )
}
