import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { NO_TRANSLATIONS, type CatalogueTranslations } from '../shared/catalogueTranslations'
import { readVsDataRelease } from './vsDataSummaries'
import { spellingGroups } from '../shared/importNames'

const languageFile = z.record(z.string(), z.string())
/** Longer strings are descriptions, which nothing matches a list against. */
const NAME_MAX_LENGTH = 200

/**
 * Every name the official app prints in another language, from the base rules version's VS Data release, and every
 * translation New Recruit's community gives a catalogue name, or none for a snapshot published without either.
 */
export function loadCatalogueTranslations(directory: string): CatalogueTranslations {
  const translations = new Map<string, string[]>()
  const add = (english: string, translated: string) => {
    const names = translations.get(english) ?? []
    if (translated.trim() && translated !== english && !names.includes(translated)) names.push(translated)
    translations.set(english, names)
  }
  const names = readVsDataRelease(directory)?.names
  for (const [english, ...others] of spellingGroups(names)) for (const other of others) add(english!, other)
  // A faction's group holds its keyword and the name lists print it under, as "Adeptus Astartes" and "Space Marines",
  // either of which a catalogue can be named.
  for (const group of names?.factions ?? []) for (const name of group) for (const other of group) add(name, other)
  const folder = path.join(directory, 'translations', 'data')
  if (!fs.existsSync(folder)) return translations.size ? translations : NO_TRANSLATIONS
  for (const file of fs
    .readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .toSorted()) {
    for (const [english, translated] of Object.entries(languageFile.parse(JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'))))) {
      if (english.length > NAME_MAX_LENGTH || translated.length > NAME_MAX_LENGTH) continue
      add(english, translated)
      // Faction keywords name every army, where translations of the catalogues' own names are patchy.
      const keyword = /^Faction: (.+)$/.exec(english)?.[1]
      const name = /^[^:]+:\s*(.+)$/.exec(translated)?.[1]
      if (keyword && name) add(keyword, name)
    }
  }
  return translations
}
