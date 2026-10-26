import { plainQuotes, plainDashes } from '../core/text'
import { cachedIn, remember } from '../core/collections'
import { nameOf, targetOf } from '../core/catalogue'
import { isNonMatchedPlayName, matchedPlayName, normalizedName, normalizedNameVariants } from '../core/name'
import { routeSlug } from '../core/slug'
import { type LoadedCatalogue, datasheetsOf } from './catalogueIndex'
import type { DatasheetDetails, FactionContent } from './datacards'
import { factionContentsOf } from './factionNames'

/**
 * The one join between a catalogue datasheet and its Game Datacards card.
 *
 * The book's own faction file is checked by name, then identical cards shared by
 * other files.
 */
type DatacardJoin = { details: DatasheetDetails; own: boolean }

const cardIndexes = new WeakMap<FactionContent, Map<string, DatasheetDetails>>()
const joins = new WeakMap<LoadedCatalogue, Map<string, DatacardJoin | null>>()

/** Catalogue and datacard sources use different apostrophe and hyphen glyphs in otherwise identical names. */
const comparable = (name: string) => normalizedName(plainDashes(plainQuotes(name.normalize('NFKC'))))

function cardIn(content: FactionContent, name: string): DatasheetDetails | null {
  const index = remember(
    cardIndexes,
    content,
    () => new Map([...content.datasheetDetails].map(([cardName, details]) => [comparable(cardName), details])),
  )
  for (const candidate of normalizedNameVariants(comparable(name))) {
    const card = index.get(candidate)
    if (card) return card
  }
  return null
}

export function datacardOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string): DatacardJoin | null {
  return cachedIn(joins, loaded, `${catalogueId}:${entryId}`, () => join(loaded, catalogueId, entryId))
}

function join(loaded: LoadedCatalogue, catalogueId: string, entryId: string): DatacardJoin | null {
  const entry = loaded.index.definitions.get(entryId)
  const book = loaded.index.catalogues.get(catalogueId)
  if (!entry || !book) return null
  const definition = targetOf(entry, loaded.index.definitions)
  if (loaded.datacardExcludedCatalogueIds?.has(loaded.index.catalogueOf.get(definition.id) ?? '')) return null
  const name = nameOf(entry, loaded.index.definitions)
  // An allied datasheet's card is in the file of the book it is borrowed from; the
  // book's own file, and the files of the books it is a supplement to, come after.
  const source = loaded.index.alliedDatasheets.get(catalogueId)?.get(entryId)?.name
  const nearby = [...new Set([...(source ? factionContentsOf(loaded, source) : []), ...factionContentsOf(loaded, book.name)])]
  for (const content of nearby) {
    const card = cardIn(content, name)
    if (card) return { details: card, own: true }
  }
  const cards = [...new Set(loaded.factionContents.values())].flatMap((content) =>
    nearby.includes(content) ? [] : (cardIn(content, name) ?? []),
  )
  const agreed = cards.length > 0 && cards.every((card) => JSON.stringify(card) === JSON.stringify(cards[0]))
  return agreed ? { details: cards[0]!, own: false } : null
}

/**
 * Every name the join could not carry across, by book with a file of its own: a
 * datasheet the faction page lists with no card in any file, and a card no datasheet
 * in the book answers to. `isReference` narrows the catalogue side to what the page lists.
 *
 * A card is only a gap where a datasheet this book offers wanted it. The community data
 * marks a Legends or Crucible variant by a name suffix the cards do not carry, so a card
 * those datasheets answer to is skipped rather than reported against a page that will
 * never list them.
 */
export function datacardJoinReport(loaded: LoadedCatalogue, isReference: (catalogueId: string, entryId: string) => boolean) {
  const catalogueOnly: { faction: string; name: string }[] = []
  const datacardsOnly: { faction: string; name: string }[] = []
  const factionsWithoutArmyRules: string[] = []
  const nameJoins: { faction: string; name: string }[] = []
  const nonMatchedPlayCatalogueOnly: { faction: string; name: string }[] = []
  for (const book of loaded.factions) {
    const content = loaded.factionContents.get(routeSlug(book.name))
    if (!content) continue
    if (!content.armyRules.length) factionsWithoutArmyRules.push(book.name)
    const matched = new Set<DatasheetDetails>()
    const nonMatchedPlay = new Set<string>()
    for (const entryId of datasheetsOf(loaded.index, book.id)) {
      const found = datacardOf(loaded, book.id, entryId)
      if (found?.own) matched.add(found.details)
      const entry = loaded.index.definitions.get(entryId)
      const name = entry ? nameOf(entry, loaded.index.definitions) : entryId
      const isNonMatchedPlay = isNonMatchedPlayName(name)
      if (isNonMatchedPlay) nonMatchedPlay.add(comparable(matchedPlayName(name)))
      if (!isReference(book.id, entryId)) continue
      if (isNonMatchedPlay) {
        if (!found) nonMatchedPlayCatalogueOnly.push({ faction: book.name, name })
      } else if (found) nameJoins.push({ faction: book.name, name })
      else catalogueOnly.push({ faction: book.name, name })
    }
    for (const [cardName, details] of content.datasheetDetails) {
      if (matched.has(details) || nonMatchedPlay.has(comparable(cardName))) continue
      datacardsOnly.push({ faction: book.name, name: cardName })
    }
  }
  return { catalogueOnly, datacardsOnly, factionsWithoutArmyRules, nameJoins, nonMatchedPlayCatalogueOnly }
}
