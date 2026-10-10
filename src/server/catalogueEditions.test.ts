import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CanonicalCatalogue, CanonicalDatasheet } from '../contracts/catalogue'
import { shelfOf, withCards } from './catalogue.fixtures'
import { catalogueEditionLoaders } from './catalogueEditions'
import type { CatalogueEdition } from '../core/catalogueEdition'

const mocks = vi.hoisted(() => ({ loadCatalogue: vi.fn(), compile: vi.fn() }))
vi.mock('./catalogueIndex', async (original) => ({
  ...(await original<typeof import('./catalogueIndex')>()),
  loadCatalogue: mocks.loadCatalogue,
}))
vi.mock('./rules', async (original) => ({ ...(await original<typeof import('./rules')>()), loadRules: () => null }))
vi.mock('./canonicalCatalogue', async (original) => ({
  ...(await original<typeof import('./canonicalCatalogue')>()),
  compileCanonicalCatalogueFromSnapshot: mocks.compile,
}))

let directory: string
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-edition-'))
  vi.clearAllMocks()
})
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

const books = (prefix = '') => {
  const parent = `${prefix}parent`,
    child = `${prefix}child`
  const loaded = shelfOf(
    {
      id: parent,
      name: 'Marines',
      selectionEntries: [{ id: 'leader', name: 'Leader', type: 'unit' }],
      sharedSelectionEntries: [
        {
          id: 'wrapper',
          name: 'Detachments',
          type: 'upgrade',
          selectionEntryGroups: [
            {
              id: 'options',
              selectionEntries: [{ id: 'shared-detachment', name: 'Shared detachment', type: 'upgrade' }],
            },
          ],
        },
      ],
    },
    {
      id: child,
      name: 'Chapter',
      selectionEntries: [{ id: 'squad', name: 'Squad', type: 'unit' }],
      catalogueLinks: [{ targetId: parent, importRootEntries: true }],
    },
  )
  const cards = withCards('Marines', [])
  cards.detachments.add('Shared detachment')
  loaded.factionContents.set('marines', cards)
  return loaded
}

function versions(catalogueIds: string[], promoted = false) {
  const edition: CatalogueEdition = {
    id: 'codex',
    name: 'Codex',
    status: promoted ? 'released' : 'preview',
    default: promoted,
    catalogueIds,
    releases: [{ at: 1, status: promoted ? 'released' : 'preview' }],
  }
  fs.writeFileSync(
    path.join(directory, 'composition.json'),
    JSON.stringify({
      format: 'praetorium.catalogue-composition.v1',
      overlays: [],
      editions: [{ edition, sources: {}, overlays: [] }],
    }),
  )
  mocks.loadCatalogue.mockReturnValue({ ...books('codex~'), edition })
  const base = books()
  return catalogueEditionLoaders(
    directory,
    () => base,
    () => null,
  )
}

it('resolves inherited detachment destinations without offering support books as selectable codexes', () => {
  const loaded = versions(['child'])
  const selected = loaded.factions()!.factions.find((faction) => faction.id === 'codex~child')!
  const destination = selected.detachments[0]!.referenceRoute!.catalogueId
  expect({
    destination,
    referenced: loaded.factionFor(destination)?.id,
    selectable: loaded.factions()!.factions.some((faction) => faction.id === 'codex~parent'),
  }).toEqual({ destination: 'codex~parent', referenced: 'codex~parent', selectable: false })
})

it('refuses exact support reads from unregistered codexes', () => {
  expect(versions(['child']).factionFor('missing~parent')).toBeNull()
})

it('keeps saved catalogue IDs on their rules when another version becomes the default', () => {
  const loaded = versions(['parent'], true)
  expect({ saved: loaded.factionFor('parent')?.id, current: loaded.factionFor('marines')?.id }).toEqual({
    saved: 'parent',
    current: 'codex~parent',
  })
})

it('preserves base relationship destinations across all factions after codex promotion', () => {
  const loaded = versions(['parent'], true)
  const relationship = { kind: 'leader' as const, name: 'Leader', entryId: 'leader', route: { catalogueId: 'marines', slug: 'leader' } }
  const sheets = ['parent', 'child'].map(
    (catalogueId) =>
      ({
        catalogueId,
        faction: catalogueId === 'parent' ? 'Marines' : 'Chapter',
        referenceRoute: { catalogueId: catalogueId === 'parent' ? 'marines' : 'chapter', slug: 'unit' },
        attachments: [relationship],
        leaders: [relationship],
        supporters: [relationship],
      }) as CanonicalDatasheet,
  )
  const primary = { datasheets: sheets, detachments: [], issues: [], revisions: {}, ruleDocuments: [] } as unknown as CanonicalCatalogue
  mocks.compile.mockReturnValue({ ...primary, datasheets: [] })
  const result = loaded.canonicalCatalogue(primary)!
  expect(
    result.datasheets.map((sheet) => ({
      route: sheet.referenceRoute,
      destinations: [sheet.attachments, sheet.leaders, sheet.supporters].flat().map((entry) => entry.route?.catalogueId),
    })),
  ).toEqual([
    { route: { catalogueId: 'parent', slug: 'unit' }, destinations: ['parent', 'parent', 'parent'] },
    { route: { catalogueId: 'chapter', slug: 'unit' }, destinations: ['parent', 'parent', 'parent'] },
  ])
})
