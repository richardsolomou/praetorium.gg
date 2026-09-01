import { nameOf, targetOf } from '../core/catalogue'
import { routeSlug } from '../core/slug'
import { type LoadedCatalogue, datasheetsOf } from './catalogueIndex'
import type { DatasheetDetails, FactionContent } from './datacards'
import { factionContentsOf } from './factionNames'
import { relatedExternalIds } from './externalReferences'

/**
 * The one join between a catalogue datasheet and its Game Datacards card.
 *
 * Exact references take priority. An entity without one falls back to the book's
 * own faction file by name, then to an identical card shared by other files.
 */
export type DatacardJoin = { details: DatasheetDetails; own: boolean; method: 'external-ref' | 'name' }

const cardIndexes = new WeakMap<FactionContent, Map<string, DatasheetDetails>>()
const joins = new WeakMap<LoadedCatalogue, Map<string, DatacardJoin | null>>()

/** Catalogue and datacard sources use different apostrophe glyphs in otherwise identical names. */
const comparable = (name: string) =>
  name
    .normalize('NFKC')
    .replaceAll(/[‘’ʼ]/g, "'")
    .trim()
    .toLocaleLowerCase()

function cardIn(content: FactionContent, name: string): DatasheetDetails | null {
  let index = cardIndexes.get(content)
  if (!index) {
    index = new Map([...content.datasheetDetails].map(([cardName, details]) => [comparable(cardName), details]))
    cardIndexes.set(content, index)
  }
  const wanted = comparable(name)
  return index.get(wanted) ?? index.get(`${wanted}s`) ?? (wanted.endsWith('s') ? index.get(wanted.slice(0, -1)) : undefined) ?? null
}

export function datacardOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string): DatacardJoin | null {
  const key = `${catalogueId}:${entryId}`
  const cache = joins.get(loaded) ?? new Map<string, DatacardJoin | null>()
  if (!joins.has(loaded)) joins.set(loaded, cache)
  if (cache.has(key)) return cache.get(key) ?? null
  const found = join(loaded, catalogueId, entryId)
  cache.set(key, found)
  return found
}

function join(loaded: LoadedCatalogue, catalogueId: string, entryId: string): DatacardJoin | null {
  const entry = loaded.index.definitions.get(entryId)
  const book = loaded.index.catalogues.get(catalogueId)
  if (!entry || !book) return null
  const name = nameOf(entry, loaded.index.definitions)
  // An allied datasheet's card is in the file of the book it is borrowed from; the
  // book's own file, and the files of the books it is a supplement to, come after.
  const source = loaded.index.alliedDatasheets.get(catalogueId)?.get(entryId)?.name
  const nearby = [...new Set([...(source ? factionContentsOf(loaded, source) : []), ...factionContentsOf(loaded, book.name)])]
  const definitionId = targetOf(entry, loaded.index.definitions).id
  const externalIds = relatedExternalIds(loaded.sourceReferences.units, 'bsdata', definitionId, 'game-datacards')
  if (externalIds.length) {
    const cardsIn = (content: FactionContent) => externalIds.flatMap((id) => content.datasheetIds.get(id) ?? [])
    for (const content of nearby) {
      const cards = cardsIn(content)
      if (!cards.length) continue
      const agreed = cards.every((details) => JSON.stringify(details) === JSON.stringify(cards[0]))
      return agreed ? { details: cards[0]!, own: true, method: 'external-ref' } : null
    }
    const matches = [...new Set(loaded.factionContents.values())].flatMap((content) => cardsIn(content))
    if (matches.length) {
      const agreed = matches.every((details) => JSON.stringify(details) === JSON.stringify(matches[0]))
      return agreed ? { details: matches[0]!, own: false, method: 'external-ref' } : null
    }
  }
  for (const content of nearby) {
    const card = cardIn(content, name)
    if (card) return { details: card, own: true, method: 'name' }
  }
  const cards = [...new Set(loaded.factionContents.values())].flatMap((content) =>
    nearby.includes(content) ? [] : (cardIn(content, name) ?? []),
  )
  const agreed = cards.length > 0 && cards.every((card) => JSON.stringify(card) === JSON.stringify(cards[0]))
  return agreed ? { details: cards[0]!, own: false, method: 'name' } : null
}

/**
 * Every name the join could not carry across, by book with a file of its own: a
 * datasheet the faction page lists with no card in any file, and a card no datasheet
 * in the book answers to. `isReference` narrows the catalogue side to what the page lists.
 */
export function datacardJoinReport(loaded: LoadedCatalogue, isReference: (catalogueId: string, entryId: string) => boolean) {
  const catalogueOnly: { faction: string; name: string }[] = []
  const datacardsOnly: { faction: string; name: string }[] = []
  const fallbacks: { faction: string; name: string }[] = []
  let exact = 0
  for (const book of loaded.factions) {
    const leaf = book.name.split(' - ').at(-1) ?? book.name
    const content = loaded.factionContents.get(routeSlug(leaf))
    if (!content) continue
    const matched = new Set<DatasheetDetails>()
    for (const entryId of datasheetsOf(loaded.index, book.id)) {
      const found = datacardOf(loaded, book.id, entryId)
      if (found?.own) matched.add(found.details)
      if (found?.method === 'external-ref' && isReference(book.id, entryId)) exact++
      if (found?.method === 'name' && isReference(book.id, entryId)) {
        const entry = loaded.index.definitions.get(entryId)
        fallbacks.push({ faction: book.name, name: entry ? nameOf(entry, loaded.index.definitions) : entryId })
      }
      if (!found && isReference(book.id, entryId)) {
        const entry = loaded.index.definitions.get(entryId)
        catalogueOnly.push({ faction: book.name, name: entry ? nameOf(entry, loaded.index.definitions) : entryId })
      }
    }
    for (const [cardName, details] of content.datasheetDetails) {
      if (!matched.has(details)) datacardsOnly.push({ faction: book.name, name: cardName })
    }
  }
  return { catalogueOnly, datacardsOnly, exact, fallbacks }
}
