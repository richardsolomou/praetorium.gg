import type { CatalogueIndex, Definition, Profile } from '../core/catalogue'
import { routeSlug } from '../core/slug'
import { datacardsFactionKeys, type SectionProse } from './datacards'
import { joinKey } from './rulesSource'

/**
 * The words behind a section a rules card names and does not describe.
 *
 * Game Datacards writes the Aeldari Agile Manoeuvres as six titles and nothing else,
 * so the card prints a heading over an empty section. What each manoeuvre triggers on
 * and does is in the community catalogue instead, on an entry the catalogue names
 * after the card and the section together — `Battle Focus - Agile Manoeuvres` — and
 * that name is the join. Reaching it by title alone would have let any entry in any
 * book answer: Star Engines is a Vyper's upgrade as well as a manoeuvre.
 *
 * So a section is answered only by an entry in this faction's own books, named for the
 * card and section, carrying a profile for every title the section lists. Anything
 * else — a renamed entry, a section only half described, two entries disagreeing —
 * leaves the source's own titles standing with no invented prose beneath them.
 */
export function catalogueSections(index: CatalogueIndex): SectionProse {
  return ({ faction, entry, titles }) => {
    const found = new Map<string, string>()
    if (!titles.length) return found
    const books = booksOf(index, faction)
    const named = joinKey(entry)
    const keys = titles.map(joinKey)
    const covering = [...index.definitions.values()]
      .filter(
        (definition) =>
          definition.profiles?.length && joinKey(definition.name ?? '') === named && books.has(index.catalogueOf.get(definition.id) ?? ''),
      )
      .map(sectionProse)
      .filter((prose) => keys.every((key) => prose.has(key)))
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
      catalogue.name.split(' - ').some((segment) => segment.toLocaleLowerCase() !== 'library' && keys.has(routeSlug(segment)))
        ? [catalogue.id]
        : [],
    ),
  )
}

/** What one entry says about each of the profiles it names. */
function sectionProse(definition: Definition) {
  const found = new Map<string, string>()
  for (const profile of definition.profiles ?? []) {
    const description = profileDescription(profile)
    if (profile.name && !profile.hidden && description) found.set(joinKey(profile.name), description)
  }
  return found
}

const profileDescription = (profile: Profile) =>
  profile.characteristics?.find((characteristic) => characteristic.name === 'Description')?.$text ?? null
