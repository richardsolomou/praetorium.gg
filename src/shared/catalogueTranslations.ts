import { remember } from '../core/collections'
import { normalized } from './importMismatch'

/** The names other languages give each English catalogue name, as New Recruit's community translates them. */
export type CatalogueTranslations = ReadonlyMap<string, readonly string[]>

export const NO_TRANSLATIONS: CatalogueTranslations = new Map()

/** A catalogue name and every translation of it. */
export const translationsOf = (name: string, translations: CatalogueTranslations) => [name, ...(translations.get(name) ?? [])]

const englishCache = new WeakMap<CatalogueTranslations, { exact: Map<string, string[]>; loose: Map<string, string[]> }>()

/**
 * A translated name with its accents, plural endings and word order set aside, since a list builder's own translation
 * can differ from the official app's in just those, as Mini Headquarters' "Carnivores Kroot" for the app's "Carnivores Kroots".
 */
const loosely = (name: string) =>
  normalized(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\d]+/u)
    .filter(Boolean)
    .map((word) => (word.length > 3 ? word.replace(/[sx]$/, '') : word))
    .toSorted()
    .join(' ')

/**
 * The English catalogue names a translated name stands for; more than one where a language gives two names the same
 * word. A name no translation spells exactly is matched loosely.
 */
export function englishNames(translated: string, translations: CatalogueTranslations): readonly string[] {
  const { exact, loose } = remember(englishCache, translations, () => {
    const found = { exact: new Map<string, string[]>(), loose: new Map<string, string[]>() }
    const add = (map: Map<string, string[]>, key: string, name: string) => {
      const names = map.get(key) ?? []
      if (!names.includes(name)) names.push(name)
      map.set(key, names)
    }
    for (const [name, others] of translations)
      for (const other of others) {
        add(found.exact, normalized(other), name)
        add(found.loose, loosely(other), name)
      }
    return found
  })
  return exact.get(normalized(translated)) ?? loose.get(loosely(translated)) ?? []
}
