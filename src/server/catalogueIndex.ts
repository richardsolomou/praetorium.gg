import { hash } from 'node:crypto'
import {
  absentAbilitiesFor,
  absentDetachmentRuleFor,
  compactReleaseIn,
  withoutAbsentAbilities,
  withoutAbsentDetachmentRules,
} from './absentAbilities'
import { withDefinitionTokens, withDefinitionTokensIn } from './sourceTexts'
import { definitionTexts } from './definitionTexts'
import { cardTwins } from './cardTwins'
import { textOfFactsKey, type TextFacts, type TextFactsByKey } from '../core/textFacts'
import { vsDataTextFacts } from './vsDataEffects'
import { combatOfVsDataOrWords } from '../shared/vsDataEffects'
import { combatRuleRoles } from '../core/combatRules'
import fs from 'node:fs'
import path from 'node:path'
import { buildIndex, type CatalogueFile } from '../core/catalogue'
import { editionCatalogueFiles, type CatalogueEdition } from '../core/catalogueEdition'
import { catalogueReferencePolicySchema, datacardExclusions } from '../core/catalogueReferencePolicy'
import { loadDatacardsSteps } from './datacards'
import { type FactionContent, type LoadedDatacards } from '../shared/datacards'
import { remember } from '../core/collections'
import { catalogueSections } from './catalogueSections'
import { loadMfmSteps } from './mfm'
import { vsPointsIn, vsProfilesIn, vsRosterDefinitionsIn } from './vsDataPoints'
import { baseSizesByEntry } from '../shared/vsDataBaseSizes'
import { readSharedJson } from './sharedJson'
import { type DefinitionTexts, type LoadedCatalogue, catalogueFromIndex } from '../shared/catalogueIndex'
import { completeSteps, type Steps } from '../shared/steps'
import { liveCatalogueRevision } from './liveCatalogue'
import { readRevisions } from './catalogueSources'
const NO_FACTS: TextFacts = { combat: null }

/**
 * What list building reads of a text, and a datasheet characteristic a catalogue prints as an ability's bare value, as
 * an Invulnerable Save of "4+": read from the catalogue until lists and datasheets are built from VS Data (#2007).
 */
const CATALOGUE_FIELDS = ['attachment', 'substitutes', 'reserveExemption', 'bareValue', 'unitHeldWargear'] as const
const withLegality = (facts: TextFacts, words: TextFacts | undefined): TextFacts => {
  const kept = Object.fromEntries(CATALOGUE_FIELDS.flatMap((field) => (words?.[field] === undefined ? [] : [[field, words[field]]])))
  const {
    attachment: _attachment,
    substitutes: _substitutes,
    reserveExemption: _exemption,
    bareValue: _bareValue,
    unitHeldWargear: _unitHeld,
    ...rest
  } = facts
  // The rules a text names, which a datasheet explains beside it, are VS Data's and the words' until VS Data names them all.
  const references = [...new Set([...(facts.references ?? []), ...(words?.references ?? [])])]
  return { ...rest, ...kept, ...(references.length ? { references } : {}) }
}

export function catalogueDirectory(dataDirectory = process.env.DATA_DIR ?? '/data') {
  const live = liveCatalogueRevision()
  return live ? path.join(live.directory, 'catalogue') : (process.env.CATALOGUE_DIR ?? path.join(path.resolve(dataDirectory), 'catalogue'))
}
export function loadCatalogue(
  directory = catalogueDirectory(),
  edition?: CatalogueEdition,
  options?: { snapshotDirectory?: string },
): LoadedCatalogue | null {
  return completeSteps(loadCatalogueSteps(directory, edition, options))
}

export function* loadCatalogueSteps(
  directory = catalogueDirectory(),
  edition?: CatalogueEdition,
  {
    /** The snapshot holding every rules version's VS Data release, which a rules version's own folder does not. */
    snapshotDirectory = directory,
  }: { snapshotDirectory?: string } = {},
): Steps<LoadedCatalogue | null> {
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
  // An ability VS Data marks absent from this rules version's datasheets is hidden there, so no view or calculation shows it.
  const absent = absentAbilitiesFor(directory, edition?.id)
  const visible = withoutAbsentAbilities(
    read.map((entry) => entry.file),
    absent.profiles,
    absent.names,
  )
  for (const [at, entry] of read.entries()) entry.file = visible[at]!

  // The catalogue reads its rules texts as tokens with their facts, as a device's catalogue does; only the server keeps the words.
  const texts = definitionTexts(read)
  yield
  const revisionId = catalogueRevision({ ...revision, ...(edition ? { edition: edition.id } : {}) })
  let cardFacts: TextFactsByKey | undefined
  const indexOf = (source: DefinitionTexts, selected: CatalogueFile[], facts?: TextFactsByKey) =>
    buildIndex(selected, revisionId, facts ?? { get: (key) => source.fact(key) ?? cardFacts?.get(key) })
  const policyFile = path.join(directory, 'reference-policy.json')
  const policy = fs.existsSync(policyFile) ? catalogueReferencePolicySchema.parse(JSON.parse(fs.readFileSync(policyFile, 'utf8'))) : null
  const files = texts.files.map(({ file }) => file)
  const selected = edition ? editionCatalogueFiles(files, edition) : files
  const index = indexOf(texts, selected)
  yield
  // The cards name sections they do not describe, and the catalogue is where those words are.
  const cardDirectory = path.join(directory, 'datacards', '11th', 'gdc')
  const cards = yield* loadDatacardsSteps(cardDirectory, catalogueSections(index, texts.words), strings)
  cardFacts = cards.textFacts
  const datacards = withoutAbsentDetachmentRules(publishedDatacards(cards, texts.token), absentDetachmentRuleFor(directory, edition?.id))
  const release = compactReleaseIn(directory, edition?.id)
  const vsRoster = vsRosterDefinitionsIn(directory, index, edition?.id) ?? undefined
  const ownTexts: LoadedCatalogue = {
    ...catalogueFromIndex(index, selected, datacards, vsRoster),
    definitions: texts,
    keywords: Object.values(release?.keywords ?? {}),
    ...(release?.units ? { baseSizes: baseSizesByEntry({ units: release.units, entries: release.entries }) } : {}),
    ...(policy ? { datacardExcludedCatalogueIds: datacardExclusions(policy.datacardExcludedCatalogueIds, edition) } : {}),
    ...(edition ? { edition } : {}),
  }
  // What every rule does is read from VS Data's effect blocks, where the snapshot keeps them; a text joining no record
  // VS Data has read takes no part in anything the rules read. A text's holders are those of the texts shown once the
  // cards stand in for the catalogue's, which a card text's record is chosen by.
  let holding: Pick<DefinitionTexts, 'holders'> = texts
  const effects = vsDataTextFacts(snapshotDirectory, edition?.id, cardDirectory, { holders: (key) => holding.holders?.(key) ?? [] })
  const twins = cardTwins(ownTexts, effects)
  yield
  // Readers load a rule's words from the cards wherever they print it, and from the catalogue only where they do not.
  // The swap is made in the files already built, as renaming a rules version's books again would cost as much as the
  // first time, and what the catalogue derives from them besides the index reads no text.
  const shown = texts.withTwins(twins)
  holding = shown
  const shownCards = withoutTwinSearch(datacards)
  const readFacts = new Map<string, TextFacts | undefined>()
  // Held alone, so the facts keep none of the cards' other readings alive.
  const cardWords = cards.textWords
  const factsOf = (key: string) => {
    // A text's facts for one rule or profile holding it are recorded only where its holders read differently.
    const text = textOfFactsKey(key)
    const recorded = effects!.get(key)
    if (!recorded && text !== key) return undefined
    const facts = withLegality(recorded ?? NO_FACTS, shown.fact(text) ?? cardFacts?.get(text))
    const vsData = facts.combat
    const roles = () => {
      const said = shown.said(text) ?? cardWords?.(text)
      return said === undefined ? [] : combatRuleRoles(said)
    }
    let combat: TextFacts['combat']
    // The words are read only when asked, as most texts' facts are never asked for their combat.
    return Object.defineProperty(facts, 'combat', {
      enumerable: true,
      get: () => (combat === undefined ? (combat = combatOfVsDataOrWords(vsData, roles)) : combat),
    })
  }
  const vsProfiles = vsProfilesIn(directory, index, ownTexts.keywords ?? [], edition?.id)
  const loaded: LoadedCatalogue = {
    ...ownTexts,
    index: {
      ...indexOf(
        shown,
        shown.shown(selected),
        effects
          ? {
              get: (key) => remember(readFacts, key, () => factsOf(key)),
            }
          : undefined,
      ),
      ...(vsRoster ? { attachments: vsRoster.attachments } : {}),
    },
    definitions: shown,
    factionContents: shownCards.factions,
    datacards: shownCards,
  }
  yield
  const vsPoints = vsPointsIn(directory, loaded.index, edition?.id)
  return {
    ...loaded,
    mfm: yield* loadMfmSteps(directory),
    ...(vsPoints ? { vsPoints } : {}),
    ...(vsProfiles ? { vsProfiles } : {}),
  }
}

/** Cards with the catalogue's words they quote swapped for the catalogue's tokens. */
function publishedDatacards(cards: LoadedDatacards, token: (raw: string) => string | null): LoadedDatacards {
  // The facts hold no text, and walking them would read every combat reading they hold only when asked.
  const { textFacts, textWords: _words, ...rest } = cards
  const published = { ...withDefinitionTokens(rest, token), ...(textFacts ? { textFacts } : {}) }
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
