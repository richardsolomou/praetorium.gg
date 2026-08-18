import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'

export type DatasheetDetails = {
  composition: string[]
  loadout: string | null
  wargear: string[]
  baseSize: string | null
  transport: string | null
  points: { models: string; cost: string; keyword: string | null; faction: string | null; detachment: string | null }[]
  attachesTo: { kind: 'leader' | 'support'; name: string }[]
  leaders: string[]
  supporters: string[]
}

export type FactionContent = {
  datasheets: Set<string>
  datasheetDetails: Map<string, DatasheetDetails>
  detachments: Set<string>
}

type DatacardsFaction = {
  id?: unknown
  name?: unknown
  datasheets?: unknown
  detachments?: unknown
}

export function loadFactionContents(directory: string): Map<string, FactionContent> {
  const found = new Map<string, FactionContent>()
  if (!fs.existsSync(directory)) return found
  for (const fileName of fs.readdirSync(directory).filter((entry) => entry.endsWith('.json'))) {
    const parsed = JSON.parse(fs.readFileSync(path.join(directory, fileName), 'utf8')) as DatacardsFaction
    if (typeof parsed.name !== 'string' || !Array.isArray(parsed.datasheets) || !Array.isArray(parsed.detachments)) continue
    const datasheets = parsed.datasheets.flatMap((entry) => {
      const datasheetName = localizedField(entry, 'name')
      return datasheetName ? [{ name: datasheetName, details: datasheetDetails(entry) }] : []
    })
    const datasheetDetailsByName = new Map(datasheets.map(({ name: datasheetName, details }) => [datasheetName, details]))
    for (const { name: sourceName, details } of datasheets) {
      for (const attachment of details.attachesTo) {
        const target = datasheetDetailsByName.get(attachment.name)
        if (!target) continue
        const list = attachment.kind === 'leader' ? target.leaders : target.supporters
        if (!list.includes(sourceName)) list.push(sourceName)
      }
    }
    found.set(routeSlug(parsed.name), {
      datasheets: new Set(datasheets.map(({ name: datasheetName }) => datasheetName)),
      datasheetDetails: datasheetDetailsByName,
      detachments: new Set(
        parsed.detachments.flatMap((entry) => {
          if (!entry || typeof entry !== 'object' || !('name' in entry)) return []
          const localized = entry.name
          return localized && typeof localized === 'object' && 'en' in localized && typeof localized.en === 'string' ? [localized.en] : []
        }),
      ),
    })
  }
  return found
}

function localizedField(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object') return null
  const localized: unknown = (value as Record<string, unknown>)[field]
  if (!localized || typeof localized !== 'object') return null
  const english: unknown = (localized as Record<string, unknown>).en
  return typeof english === 'string' ? english : null
}

function localizedList(value: unknown, field: string): string[] {
  if (!value || typeof value !== 'object') return []
  const localized: unknown = (value as Record<string, unknown>)[field]
  if (!Array.isArray(localized)) return []
  return localized.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return []
    const english: unknown = (entry as Record<string, unknown>).en
    return typeof english === 'string' ? [english] : []
  })
}

function datasheetDetails(value: unknown): DatasheetDetails {
  return {
    composition: localizedList(value, 'composition'),
    loadout: localizedField(value, 'loadout'),
    wargear: localizedList(value, 'wargear'),
    baseSize: displayBaseSize(localizedField(value, 'baseSize')),
    transport: localizedField(value, 'transport'),
    points: records(value, 'points').flatMap((point) => {
      const models = stringField(point, 'models')
      const cost = stringField(point, 'cost')
      return models && cost
        ? [
            {
              models,
              cost,
              keyword: nullableStringField(point, 'keyword'),
              faction: nullableStringField(point, 'faction'),
              detachment: nullableStringField(point, 'detachment'),
            },
          ]
        : []
    }),
    attachesTo: records(value, 'attachesTo').flatMap((attachment) => {
      const kind = stringField(attachment, 'type')
      const name = stringField(attachment, 'target')
      return (kind === 'leader' || kind === 'support') && name ? [{ kind, name }] : []
    }),
    leaders: [],
    supporters: [],
  }
}

function displayBaseSize(baseSize: string | null): string | null {
  if (baseSize === 'Large Flying Base') return 'Large Flying Base (Ø60mm)'
  if (baseSize === 'Small Flying Base') return 'Small Flying Base (Ø32mm)'
  if (baseSize === 'Aircraft Flying Base') return 'Aircraft Flying Base (120 × 92 mm oval)'
  return baseSize
}

function records(value: unknown, field: string): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return []
  const entries: unknown = (value as Record<string, unknown>)[field]
  return Array.isArray(entries)
    ? entries.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    : []
}

function stringField(value: Record<string, unknown>, field: string): string | null {
  const found = value[field]
  return typeof found === 'string' ? found : typeof found === 'number' ? String(found) : null
}

function nullableStringField(value: Record<string, unknown>, field: string): string | null {
  return value[field] === null || value[field] === undefined ? null : stringField(value, field)
}
