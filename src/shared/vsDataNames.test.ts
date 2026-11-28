import { expect, it } from 'vitest'
import rawBooks from '../../catalogue/legacy-ids/books.json' with { type: 'json' }
import type { LoadedCatalogue } from './catalogueIndex'
import { exportRuleset, rulesetCatalogueIds } from './vsDataNames'
import { idsIn } from './vsDataPoints'

it('reads every stored book back from the ruleset its export names', () => {
  const unread = Object.keys(rawBooks.ids).filter((catalogueId) => {
    const edition = catalogueId.includes('~') ? catalogueId.slice(0, catalogueId.indexOf('~')) : null
    const loaded = { vsRoster: { books: Object.fromEntries(idsIn(rawBooks.ids, edition)) } } as unknown as LoadedCatalogue
    return !rulesetCatalogueIds(exportRuleset(loaded, catalogueId)).includes(catalogueId)
  })
  expect(unread).toEqual([])
})
