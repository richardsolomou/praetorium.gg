import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'

export type DatasheetDetails = {
  composition: string[]
  loadout: string | null
  wargear: string[]
  baseSize: string | null
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
    found.set(routeSlug(parsed.name), {
      datasheets: new Set(datasheets.map(({ name: datasheetName }) => datasheetName)),
      datasheetDetails: new Map(datasheets.map(({ name: datasheetName, details }) => [datasheetName, details])),
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
    baseSize: localizedField(value, 'baseSize'),
  }
}
