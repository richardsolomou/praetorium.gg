import fs from 'node:fs'
import path from 'node:path'
import { routeSlug } from '../core/slug'

export type FactionContent = { datasheets: Set<string>; detachments: Set<string> }

type DatacardsFaction = {
  id?: unknown
  name?: unknown
  datasheets?: unknown
  detachments?: unknown
}

export function loadFactionContents(directory: string): Map<string, FactionContent> {
  const found = new Map<string, FactionContent>()
  if (!fs.existsSync(directory)) return found
  for (const name of fs.readdirSync(directory).filter((entry) => entry.endsWith('.json'))) {
    const parsed = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) as DatacardsFaction
    if (typeof parsed.name !== 'string' || !Array.isArray(parsed.datasheets) || !Array.isArray(parsed.detachments)) continue
    found.set(routeSlug(parsed.name), {
      datasheets: new Set(
        parsed.datasheets.flatMap((entry) => {
          if (!entry || typeof entry !== 'object' || !('name' in entry)) return []
          const localized = entry.name
          return localized && typeof localized === 'object' && 'en' in localized && typeof localized.en === 'string' ? [localized.en] : []
        }),
      ),
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
