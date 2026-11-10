import { profileDescription } from '../core/catalogue'
import type { CatalogueIndex, Definition } from '../core/catalogue'
import { routeSlug } from '../core/slug'
import { datacardsFactionKeys, type SectionProse } from './datacards'
import { joinKey } from '../core/text'

/** Fill an undescribed card section only from a complete matching entry in the same faction’s books; a title match alone can name unrelated wargear. */
export function catalogueSections(index: CatalogueIndex): SectionProse {
  return ({ faction, entry, titles }) => {
    const found = new Map<string, string>()
    if (!titles.length) return found
    const books = booksOf(index, faction)
    const keys = titles.map(joinKey)
    const covering = (entry === null ? [armyRuleProse(index, books)] : entryProse(index, books, joinKey(entry))).filter((prose) =>
      keys.every((key) => prose.has(key)),
    )
    for (const [at, title] of titles.entries()) {
      const said = new Set(covering.map((prose) => prose.get(keys[at]!)!))
      if (said.size === 1) found.set(title, said.values().next().value!)
    }
    return found
  }
}

/**
 * The books a Game Datacards file speaks for, its faction's library included.
 *
 * A catalogue is named for the shelf it sits on — `Xenos - Aeldari`, `Aeldari -
 * Aeldari Library` — and answers to any segment of that name, which is the same
 * reading `factionContentsOf` uses to send a book to its cards.
 */
function booksOf(index: CatalogueIndex, faction: string) {
  const keys = datacardsFactionKeys(faction)
  return new Set(
    [...index.catalogues.values()].flatMap((catalogue) =>
      catalogue.name.split(' - ').some((segment) => segment.toLowerCase() !== 'library' && keys.has(routeSlug(segment)))
        ? [catalogue.id]
        : [],
    ),
  )
}

const entryProse = (index: CatalogueIndex, books: ReadonlySet<string>, named: string) =>
  [...index.definitions.values()]
    .filter(
      (definition) =>
        (definition.profiles?.length || definition.rules?.length) &&
        joinKey(definition.name ?? '') === named &&
        books.has(index.catalogueOf.get(definition.id) ?? ''),
    )
    .map(sectionProse)

/** The faction's own rules, unless two of its books word one differently. */
function armyRuleProse(index: CatalogueIndex, books: ReadonlySet<string>) {
  const found = new Map<string, string>()
  const conflicting = new Set<string>()
  for (const rule of index.rules.values()) {
    if (!rule.name || rule.hidden || !rule.description || !books.has(index.ruleCatalogueOf.get(rule.id) ?? '')) continue
    const key = joinKey(rule.name)
    if ((found.get(key) ?? rule.description) !== rule.description) conflicting.add(key)
    found.set(key, rule.description)
  }
  for (const key of conflicting) found.delete(key)
  return found
}

/** What one entry says about each of the profiles and rules it names. */
function sectionProse(definition: Definition) {
  const found = new Map<string, string>()
  for (const profile of definition.profiles ?? []) {
    const description = profileDescription(profile)
    if (profile.name && !profile.hidden && description) found.set(joinKey(profile.name), description)
  }
  for (const rule of definition.rules ?? [])
    if (rule.name && !rule.hidden && rule.description) found.set(joinKey(rule.name), rule.description)
  return found
}
