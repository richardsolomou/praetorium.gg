/**
 * The books every catalogue test is read out of.
 *
 * A game system with one cost type, a shelf builder, and the small constructors that
 * keep each test's body about the thing it is testing. Imported only by tests, so
 * nothing here ships.
 */

import { buildIndex, type Catalogue, type CatalogueFile, type Modifier } from '../core/catalogue'
import { characteristicNamesOf, detachmentsOf, factionsIn, type LoadedCatalogue } from './catalogueIndex'
import { unitsIn } from './cataloguePicker'
import type { DatasheetDetails, FactionContent, LoadedDatacards } from './datacards'
import { emptyExternalReferences } from './externalReferences'

export const PTS = 'cost-pts'

export const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: PTS, name: 'pts' }] } }

export const points = (value: number) => [{ name: 'pts', typeId: PTS, value }]

/** A shelf of books, as the picker sees them. The first is the one being picked from. */
export function shelfOf(...catalogues: Partial<Catalogue>[]): LoadedCatalogue {
  const files = catalogues.map((catalogue, at): CatalogueFile => ({
    catalogue: { id: at ? `cat-${at}` : 'cat', name: at ? `Book ${at}` : 'Test catalogue', ...catalogue },
  }))
  const index = buildIndex([system, ...files], 'test-revision')
  const datacards: LoadedDatacards = {
    factions: new Map(),
    detachmentRules: new Map(),
    enhancements: new Map(),
    stratagems: new Map(),
    stratagemsById: new Map(),
    armyRules: new Map(),
    constructionDetachments: new Map(),
    enhancementPoints: new Map(),
  }
  return {
    index,
    characteristicNames: characteristicNamesOf([system, ...files]),
    factions: factionsIn(index, detachmentsOf(files, index)),
    detachments: detachmentsOf(files, index),
    factionContents: datacards.factions,
    datacards,
    sourceReferences: emptyExternalReferences(),
  }
}

/** A book of datasheets, as the picker sees one. */
export const bookOf = (catalogue: Partial<Catalogue>) => shelfOf(catalogue)

export const offered = (loaded: LoadedCatalogue) => unitsIn(loaded, 'cat', '').map((unit) => unit.name)

export const categories = (...names: string[]) =>
  names.map((name, at) => ({ id: `link-${at}`, targetId: `cat-${at}`, name, primary: at === 0 }))

export const ability = (id: string, name: string) => ({
  id,
  name,
  typeName: 'Abilities',
  characteristics: [{ name: 'Description', $text: `${name} text` }],
})

export type ProfileOperationCase = Pick<Modifier, 'type' | 'value' | 'position' | 'join' | 'arg'> & {
  base: string
  expected: string
  repeated?: boolean
  skipIfPresent?: string
}

export const profileOperationCases: ProfileOperationCase[] = [
  { type: 'set', base: '5', value: '4+', expected: '4+' },
  { type: 'append', base: 'Assault', value: 'Lethal Hits', expected: 'Assault, Lethal Hits', join: ', ' },
  { type: 'prepend', base: 'Lethal Hits', value: 'Assault', expected: 'Assault, Lethal Hits', join: ', ' },
  { type: 'increment', base: 'D6+1', value: 2, expected: 'D6+3', position: -1 },
  { type: 'decrement', base: '6-2', value: 1, expected: '5-3' },
  { type: 'multiply', base: '2', value: 3, expected: '12', repeated: true },
  { type: 'divide', base: '12', value: 3, expected: '2', repeated: true },
  { type: 'modulo', base: '13', value: 5, expected: '3' },
  { type: 'power', base: '2', value: 3, expected: '64', repeated: true },
  { type: 'exponent', base: '2', value: 3, expected: '18', repeated: true },
  { type: 'triangular', base: '2', value: 3, expected: '11', repeated: true },
  { type: 'floor', base: '1', value: 2, expected: '2' },
  { type: 'ceil', base: '12"', value: 9, expected: '9"' },
  { type: 'cumulative-add', base: '2', value: 3, expected: '6.5', repeated: true },
  { type: 'cumulative-power', base: '2', value: 3, expected: '4', repeated: true },
  { type: 'cumulative-multiply', base: '2', value: 3, expected: '24', repeated: true },
  { type: 'replace', base: 'Rapid Fire 1, Assault', value: 'Rapid Fire 2', expected: 'Rapid Fire 2, Assault', arg: 'Rapid Fire 1' },
  { type: 'replace', base: 'Rapid Fire 1, Assault', expected: ', Assault', arg: 'Rapid Fire 1' },
  { type: 'append', base: 'Assault', value: 'Assault', expected: 'Assault', skipIfPresent: 'Assault' },
]

export const card = (over: Partial<DatasheetDetails> = {}): DatasheetDetails => ({
  composition: [],
  loadout: null,
  wargear: [],
  baseSize: null,
  transport: null,
  points: [],
  attachesTo: [],
  leaders: [],
  supporters: [],
  ...over,
})

/** A faction's Game Datacards file, holding a card for each name. */
export const withCards = (name: string, cards: readonly string[] | ReadonlyMap<string, DatasheetDetails>): FactionContent => {
  const details = cards instanceof Map ? cards : new Map([...cards].map((cardName) => [cardName, card()]))
  return {
    name,
    datasheets: new Set(details.keys()),
    datasheetDetails: details,
    datasheetIds: new Map(),
    detachments: new Set(),
    enhancements: new Map(),
    detachmentRules: new Map(),
    factionAbilityNames: new Set(),
    armyRules: [],
  }
}
