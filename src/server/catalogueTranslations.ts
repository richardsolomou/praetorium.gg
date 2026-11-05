import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { NO_TRANSLATIONS, type CatalogueTranslations } from '../shared/catalogueTranslations'

const languageFile = z.record(z.string(), z.string())
/** Longer strings are descriptions, which nothing matches a list against. */
const NAME_MAX_LENGTH = 200

/** Every language's translations a catalogue directory holds, or none for a snapshot published without them. */
export function loadCatalogueTranslations(directory: string): CatalogueTranslations {
  const folder = path.join(directory, 'translations', 'data')
  if (!fs.existsSync(folder)) return NO_TRANSLATIONS
  const translations = new Map<string, string[]>()
  const add = (english: string, translated: string) => {
    const names = translations.get(english) ?? []
    if (translated.trim() && translated !== english && !names.includes(translated)) names.push(translated)
    translations.set(english, names)
  }
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
