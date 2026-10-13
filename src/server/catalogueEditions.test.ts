import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CanonicalCatalogue, CanonicalDatasheet } from '../contracts/catalogue'
import { shelfOf, withCards } from './catalogue.fixtures'
import { catalogueEditionLoaders } from './catalogueEditions'
import type { CatalogueEdition } from '../core/catalogueEdition'
import type { LoadedRules } from './rules'
import { ALICE, BOB, builtRoster, log } from '../core/battle.fixtures'
import { reduceBattle } from '../core/battle'
import { battleSummary } from '../shared/battleSummary'

const mocks = vi.hoisted(() => ({ loadCatalogue: vi.fn(), compile: vi.fn(), packaged: vi.fn(() => new Map()) }))
vi.mock('./catalogueIndex', async (original) => ({
  ...(await original<typeof import('./catalogueIndex')>()),
  loadCatalogue: mocks.loadCatalogue,
}))
vi.mock('./rules', async (original) => ({ ...(await original<typeof import('./rules')>()), loadRules: () => null }))
vi.mock('./canonicalCatalogue', async (original) => ({
  ...(await original<typeof import('./canonicalCatalogue')>()),
  compileCanonicalCatalogueFromSnapshot: mocks.compile,
  loadEditionCanonicalCatalogues: mocks.packaged,
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

it.each(['codex~child', 'chapter'])('compiles only the advertised factions for rules version %s', (id) => {
  const loaded = versions(['child'], true)
  mocks.compile.mockImplementation((catalogue) => ({
    datasheets: catalogue.factions.map((faction: { id: string; name: string }) => ({
      id: faction.id,
      catalogueId: faction.id,
      faction: faction.name,
    })),
    detachments: [],
    issues: [],
  }))
  expect(loaded.canonicalFor(id)!.datasheets.map((sheet) => sheet.catalogueId)).toEqual(['codex~child'])
})

it('compiles an exact support faction on demand after preparing the advertised rules', () => {
  const loaded = versions(['child'])
  mocks.compile.mockImplementation((catalogue) => ({
    datasheets: catalogue.factions.map((faction: { id: string; name: string }) => ({
      id: faction.id,
      catalogueId: faction.id,
      faction: faction.name,
    })),
    detachments: [],
    issues: [],
  }))
  loaded.canonicalFor('codex~child')
  expect(loaded.canonicalFor('codex~parent')!.datasheets.map((sheet) => sheet.catalogueId)).toEqual(['codex~parent'])
})

it('loads a named base edition from the root directory', () => {
  versions(['child'], true)
  const file = path.join(directory, 'composition.json')
  const composition = JSON.parse(fs.readFileSync(file, 'utf8'))
  composition.editions[0].base = true
  fs.writeFileSync(file, JSON.stringify(composition))
  mocks.loadCatalogue.mockClear()
  const selected = catalogueEditionLoaders(
    directory,
    () => books(),
    () => null,
  )
  selected.catalogueFor('codex~child')
  expect(mocks.loadCatalogue).toHaveBeenCalledWith(directory, composition.editions[0].edition)
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

function namedBase(rules: LoadedRules | null = null) {
  versions(['parent'], true)
  const file = path.join(directory, 'composition.json')
  const composition = JSON.parse(fs.readFileSync(file, 'utf8'))
  composition.editions[0].base = true
  fs.writeFileSync(file, JSON.stringify(composition))
  return catalogueEditionLoaders(
    directory,
    () => books(),
    () => rules,
  )
}

it('offers a named base once and opens it by default without losing exact saved IDs', () => {
  const loaded = namedBase()
  expect({
    offered: loaded.factions()!.factions.map(({ id }) => id),
    default: loaded.resolve('marines'),
    saved: loaded.factionFor('parent')?.id,
    savedLabel: loaded.factionFor('parent')?.edition?.name,
  }).toEqual({ offered: ['child', 'codex~parent'], default: 'codex~parent', saved: 'parent', savedLabel: 'Codex' })
})

it('includes unqualified frozen army IDs in the battle index without duplicating selectable rules', () => {
  const loaded = namedBase()
  expect({
    battles: loaded.battleFactions().map(({ id }) => id),
    selectable: loaded.factions()!.factions.map(({ id }) => id),
  }).toEqual({ battles: ['child', 'codex~parent', 'parent'], selectable: ['child', 'codex~parent'] })
})

it.each([undefined, { id: 'old', name: 'Previous rules', status: 'retired' as const }])(
  'restores a frozen army faction icon while preserving its recorded rules: %j',
  (edition) => {
    const loaded = namedBase({
      factionIcons: new Map([['marines', '/marines.svg']]),
      detachmentReferences: new Map(),
      detachmentDetails: new Map(),
    } as Partial<LoadedRules> as LoadedRules)
    const command = builtRoster('Marines', ['Leader'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('Missing built roster fixture')
    command.roster.built.catalogueId = 'parent'
    command.roster.built.edition = edition
    const history = {
      battle: { token: 'old-battle', createdAt: 0 },
      players: [
        { id: ALICE, name: 'Alice', automated: false },
        { id: BOB, name: 'Bob', automated: false },
      ],
      log: log([ALICE, command]),
    }
    const summary = battleSummary(
      history,
      reduceBattle([ALICE, BOB], history.log),
      null,
      null,
      new Map(loaded.battleFactions().map((faction) => [faction.id, faction])),
    )
    expect(summary.factions).toEqual([
      { slug: 'marines', displayName: 'Marines', icon: '/api/faction-icons/marines', edition: edition ?? null },
      null,
    ])
  },
)

it('does not duplicate named base datasheets in the combined reference', () => {
  const loaded = namedBase()
  const primary = {
    datasheets: [{ catalogueId: 'parent', faction: 'Marines', attachments: [], leaders: [], supporters: [] }],
    detachments: [],
    issues: [],
  } as unknown as CanonicalCatalogue
  mocks.compile.mockReturnValue({ ...primary, datasheets: [{ ...primary.datasheets[0], catalogueId: 'codex~parent' }] })
  expect(loaded.canonicalCatalogue(primary)!.datasheets.map(({ catalogueId }) => catalogueId)).toEqual(['codex~parent'])
})

it('retains exact root canonical reads after removing its selectable duplicate', () => {
  const loaded = namedBase()
  mocks.compile.mockImplementation((catalogue) => ({
    datasheets: catalogue.factions.map((faction: { id: string }) => ({ catalogueId: faction.id })),
    detachments: [],
    issues: [],
  }))
  expect(loaded.canonicalFor('parent')?.datasheets.map(({ catalogueId }) => catalogueId)).toEqual(['parent'])
})

it('reads an edition the snapshot compiled instead of compiling it at startup', () => {
  const loaded = versions(['child'])
  const packaged = { datasheets: [], detachments: [], issues: [] } as unknown as CanonicalCatalogue
  mocks.packaged.mockReturnValue(new Map([['codex:', packaged]]))
  expect({ read: loaded.canonicalFor('codex~child'), compiled: mocks.compile.mock.calls.length }).toEqual({ read: packaged, compiled: 0 })
})

it('names every edition catalogue it holds as the snapshot packages them', () => {
  const loaded = versions(['child'])
  mocks.compile.mockReturnValue({ datasheets: [], detachments: [], issues: [] })
  loaded.canonicalFor('codex~child')
  expect(loaded.canonicalEntries().map(([key]) => key)).toEqual(['codex:'])
})
