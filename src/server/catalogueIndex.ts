import { hash } from 'node:crypto'
import { withDefinitionTokens, withDefinitionTokensIn } from './sourceTexts'
import { definitionTexts } from './definitionTexts'
import { cardTwins } from './cardTwins'
import type { TextFactsByKey } from '../core/textFacts'
import fs from 'node:fs'
import path from 'node:path'
import { buildIndex, type CatalogueFile } from '../core/catalogue'
import { editionCatalogueFiles, type CatalogueEdition } from '../core/catalogueEdition'
import { catalogueReferencePolicySchema, datacardExclusions } from '../core/catalogueReferencePolicy'
import { type FactionContent, type LoadedDatacards, loadDatacardsSteps } from './datacards'
import { remember } from '../core/collections'
import { catalogueSections } from './catalogueSections'
import { loadMfmSteps } from './mfm'
import { readSharedJson } from './sharedJson'
import { type DefinitionTexts, type LoadedCatalogue, catalogueFromIndex } from '../shared/catalogueIndex'
import { completeSteps, type Steps } from '../shared/steps'
import { liveCatalogueRevision } from './liveCatalogue'
import { readRevisions } from './catalogueSources'
export * from '../shared/catalogueIndex'
export function catalogueDirectory(dataDirectory = process.env.DATA_DIR ?? '/data') {
  const live = liveCatalogueRevision()
  return live ? path.join(live.directory, 'catalogue') : (process.env.CATALOGUE_DIR ?? path.join(path.resolve(dataDirectory), 'catalogue'))
}
export function loadCatalogue(directory = catalogueDirectory(), edition?: CatalogueEdition): LoadedCatalogue | null {
  return completeSteps(loadCatalogueSteps(directory, edition))
}

export function* loadCatalogueSteps(directory = catalogueDirectory(), edition?: CatalogueEdition): Steps<LoadedCatalogue | null> {
  const definitions = path.join(directory, 'definitions')
  const revisionFile = path.join(directory, 'revision.json')
  if (!fs.existsSync(definitions) || !fs.existsSync(revisionFile)) return null

  const revision = readRevisions(directory)
  if (!revision.definitions) return null

  const strings = new Map<string, string>()
  const read: { file: CatalogueFile; path: string }[] = []
  for (const name of fs.readdirSync(definitions).filter((entry) => entry.endsWith('.json'))) {
    read.push({ file: readSharedJson(path.join(definitions, name), strings) as CatalogueFile, path: path.join(definitions, name) })
    yield
  }
  if (!read.length) return null

  // The catalogue reads its rules texts as tokens with their facts, as a device's catalogue does; only the server keeps the words.
  const texts = definitionTexts(read)
  yield
  const revisionId = catalogueRevision({ ...revision, ...(edition ? { edition: edition.id } : {}) })
  let cardFacts: TextFactsByKey | undefined
  const indexOf = (source: DefinitionTexts, selected: CatalogueFile[]) =>
    buildIndex(selected, revisionId, { get: (key) => source.fact(key) ?? cardFacts?.get(key) })
  const policyFile = path.join(directory, 'reference-policy.json')
  const policy = fs.existsSync(policyFile) ? catalogueReferencePolicySchema.parse(JSON.parse(fs.readFileSync(policyFile, 'utf8'))) : null
  const files = texts.files.map(({ file }) => file)
  const selected = edition ? editionCatalogueFiles(files, edition) : files
  const index = indexOf(texts, selected)
  yield
  // The cards name sections they do not describe, and the catalogue is where those words are.
  const cards = yield* loadDatacardsSteps(path.join(directory, 'datacards', '11th', 'gdc'), catalogueSections(index, texts.words), strings)
  cardFacts = cards.textFacts
  const datacards = publishedDatacards(cards, texts.token)
  const ownTexts: LoadedCatalogue = {
    ...catalogueFromIndex(index, selected, datacards),
    definitions: texts,
    ...(policy ? { datacardExcludedCatalogueIds: datacardExclusions(policy.datacardExcludedCatalogueIds, edition) } : {}),
    ...(edition ? { edition } : {}),
  }
  const twins = cardTwins(ownTexts)
  yield
  // Readers load a rule's words from the cards wherever they print it, and from the catalogue only where they do not.
  // The swap is made in the files already built, as renaming a rules version's books again would cost as much as the
  // first time, and what the catalogue derives from them besides the index reads no text.
  const shown = texts.withTwins(twins)
  const shownCards = withoutTwinSearch(datacards)
  const loaded: LoadedCatalogue = {
    ...ownTexts,
    index: indexOf(shown, shown.shown(selected)),
    definitions: shown,
    factionContents: shownCards.factions,
    datacards: shownCards,
  }
  yield
  return { ...loaded, mfm: yield* loadMfmSteps(directory) }
}

/** Cards with the catalogue's words they quote swapped for the catalogue's tokens. */
function publishedDatacards(cards: LoadedDatacards, token: (raw: string) => string | null): LoadedDatacards {
  const published = withDefinitionTokens(cards, token)
  const texts = (descriptions: ReadonlyMap<string, string>) =>
    new Map([...descriptions].map(([key, text]) => [key, withDefinitionTokensIn(text, token)]))
  return { ...published, armyRules: texts(cards.armyRules), enhancements: texts(cards.enhancements) }
}

/** Cards without their abilities and readings, which only found the catalogue texts' twins and which a device never reads. */
function withoutTwinSearch(datacards: LoadedDatacards): LoadedDatacards {
  const { textReadings: _, ...cards } = datacards
  const stripped = new Map<FactionContent, FactionContent>()
  const strip = (content: FactionContent) =>
    remember(stripped, content, () => ({
      ...content,
      datasheetDetails: new Map(
        [...content.datasheetDetails].map(([name, details]) => {
          const { abilities: _abilities, ...shown } = details
          return [name, shown]
        }),
      ),
    }))
  return { ...cards, factions: new Map([...cards.factions].map(([key, content]) => [key, strip(content)])) }
}

export function catalogueRevision(revisions: Record<string, string>) {
  return hash('sha256', JSON.stringify(Object.entries(revisions).sort(([left], [right]) => left.localeCompare(right))))
}
