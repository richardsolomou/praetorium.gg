import { expect, it } from 'vitest'
import rawBooks from '../../catalogue/legacy-ids/books.json' with { type: 'json' }
import type { LoadedCatalogue } from './catalogueIndex'
import { exportRuleset, rulesetCatalogueIds } from './vsDataNames'
import { idsIn } from './vsDataPoints'

const ORKS = 'a55f-b7b3-6c65-a05f'
const ULTRAMARINES = '4029-9237-e8db-af55'
const SPACE_MARINES = 'e0af-67df-9d63-8fb7'

const edition = (id: string | null, books: string[]) =>
  ({
    vsRoster: { books: Object.fromEntries(idsIn(rawBooks.ids, id)) },
    factions: books.map((book) => ({ id: id ? `${id}~${book}` : book })),
  }) as unknown as LoadedCatalogue

it('names a book by its VS Data faction, which reads back as that book', () => {
  const ruleset = exportRuleset(edition(null, [ORKS, SPACE_MARINES]), ORKS)
  expect([ruleset, rulesetCatalogueIds(ruleset).includes(ORKS)]).toEqual(['orks', true])
})

it('keeps the book ID where another book of the rules version is the same VS Data faction', () => {
  expect(exportRuleset(edition('legacy-rosters', [ULTRAMARINES, SPACE_MARINES]), `legacy-rosters~${ULTRAMARINES}`)).toBe(
    `legacy-rosters~${ULTRAMARINES}`,
  )
})
