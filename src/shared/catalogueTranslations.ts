import { remember } from '../core/collections'
import { normalized } from './importMismatch'

/** The names other languages give each English catalogue name, as New Recruit's community translates them. */
export type CatalogueTranslations = ReadonlyMap<string, readonly string[]>

export const NO_TRANSLATIONS: CatalogueTranslations = new Map()

/** A catalogue name and every translation of it. */
export const translationsOf = (name: string, translations: CatalogueTranslations) => [name, ...(translations.get(name) ?? [])]

const englishCache = new WeakMap<CatalogueTranslations, Map<string, string[]>>()

/** The English catalogue names a translated name stands for; more than one where a language gives two names the same word. */
export function englishNames(translated: string, translations: CatalogueTranslations): readonly string[] {
  const english = remember(englishCache, translations, () => {
    const found = new Map<string, string[]>()
    for (const [name, others] of translations)
      for (const other of others) {
        const key = normalized(other)
        const names = found.get(key) ?? []
        if (!names.includes(name)) names.push(name)
        found.set(key, names)
      }
    return found
  })
  return english.get(normalized(translated)) ?? []
}
