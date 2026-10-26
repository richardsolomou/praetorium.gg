import { expect, it } from 'vitest'
import type { CanonicalCatalogue, CanonicalDatasheet } from '../contracts/catalogue'
import { bookOf, points, shelfOf } from './catalogue.fixtures'
import type { ReferenceCorpus } from './referenceCorpus'
import { referenceRecord, referenceUnits, referenceFaction } from './referenceService'
import type { LoadedRules } from './rules'

it('returns roster-planning facts for a whole detachment in one read', () => {
  const loaded = bookOf({
    selectionEntries: [{ id: 'captain', name: 'Captain', type: 'unit', costs: points(80) }],
  })
  const sheet = {
    id: 'captain',
    slug: 'captain',
    referenceRoute: { catalogueId: 'test-faction', slug: 'captain' },
    catalogueId: 'cat',
    faction: 'Test Faction',
    keywords: ['Character', 'Infantry'],
    composition: ['1 Captain'],
    costs: [{ models: '1 model', cost: '80 pts', keyword: null, faction: null, detachment: null }],
    attachments: [{ kind: 'leader', name: 'Test Squad', entryId: 'squad', route: null }],
    leaders: [],
    supporters: [{ kind: 'support', name: 'Ancient', entryId: 'ancient', route: null }],
  } as unknown as CanonicalDatasheet
  const detachment = {
    catalogueId: 'cat',
    faction: 'Test Faction',
    factionSlug: 'test-faction',
    id: 'vanguard',
    slug: 'vanguard',
    name: 'Vanguard',
    points: null,
    dispositions: ['Aggressive'],
    rules: [{ name: 'Forward Positions', description: 'Units may deploy forward.' }],
    enhancements: [],
    upgrades: [],
    stratagems: [],
    keywordRules: [],
    attribution: 'Community data',
    provenance: {
      definitions: { revision: 'definitions', detachmentId: 'vanguard' },
      rules: { revision: 'rules' },
      datacards: { revision: 'datacards' },
    },
  }
  const catalogue: CanonicalCatalogue = {
    format: 'praetorium.canonical-catalogue.v1',
    compilerVersion: 1,
    revisions: { definitions: 'definitions' },
    datasheets: [sheet, { ...sheet, catalogueId: 'preview~cat', faction: 'Test Faction · Preview', composition: ['Preview composition'] }],
    detachments: [detachment],
    ruleDocuments: [],
    issues: [],
  }
  const document = {
    id: 'datasheet:test-faction:captain',
    kind: 'datasheet' as const,
    title: 'Captain',
    faction: 'Test Faction',
    url: '/factions/test-faction/rules/mfm-1-6/datasheets/captain',
    sections: [],
    revisions: {},
    attribution: [],
  }
  const corpus: ReferenceCorpus = { catalogue, documents: [document], byId: new Map([[document.id, document]]), revision: 'snapshot' }

  expect(referenceUnits(corpus, loaded, null, 'test-faction', 1_000, 'vanguard')).toMatchObject({
    faction: { id: 'cat', slug: 'test-faction', name: 'Test Faction' },
    battleSize: 1_000,
    detachment: { name: 'Vanguard', rules: [{ name: 'Forward Positions' }] },
    units: [
      {
        name: 'Captain',
        points: 80,
        keywords: ['Character', 'Infantry'],
        composition: ['1 Captain'],
        costs: [{ models: '1 model', cost: '80 pts' }],
        canLead: ['Test Squad'],
        canSupport: [],
        canBeLedBy: [],
        canBeSupportedBy: ['Ancient'],
        referenceId: 'datasheet:test-faction:captain',
        url: '/factions/test-faction/rules/mfm-1-6/datasheets/captain',
      },
    ],
  })
})

it('rejects a detachment outside the requested faction', () => {
  const loaded = bookOf({ selectionEntries: [] })
  const catalogue = {
    format: 'praetorium.canonical-catalogue.v1',
    compilerVersion: 1,
    revisions: {},
    datasheets: [],
    detachments: [],
    ruleDocuments: [],
    issues: [],
  } as CanonicalCatalogue
  const corpus: ReferenceCorpus = { catalogue, documents: [], byId: new Map(), revision: 'snapshot' }

  expect(referenceUnits(corpus, loaded, null, 'cat', undefined, 'missing')).toBeNull()
})

it('plans a chapter with a detachment its codex holds', () => {
  const loaded = shelfOf(
    {
      selectionEntries: [{ id: 'intercessors', name: 'Intercessors', type: 'unit' }],
      sharedSelectionEntries: [
        {
          id: 'wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            { id: 'choices', name: 'Detachment', selectionEntries: [{ id: 'gladius', name: 'Gladius Task Force', type: 'upgrade' }] },
          ],
        },
      ],
    },
    {
      selectionEntries: [{ id: 'templar', name: 'Templar', type: 'unit' }],
      catalogueLinks: [{ targetId: 'cat', importRootEntries: true }],
    },
  )
  const catalogue = {
    format: 'praetorium.canonical-catalogue.v1',
    compilerVersion: 1,
    revisions: {},
    datasheets: [
      {
        id: 'templar',
        slug: 'templar',
        catalogueId: 'cat-1',
        faction: 'Chapter',
        referenceRoute: { catalogueId: 'chapter', slug: 'templar' },
        attachments: [],
        leaders: [],
        supporters: [],
      },
      ...['old~cat', 'current~cat'].map((catalogueId) => ({
        id: 'intercessors',
        slug: 'intercessors',
        catalogueId,
        faction: 'Codex',
        referenceRoute: { catalogueId, slug: 'intercessors' },
        attachments: [],
        leaders: [],
        supporters: [],
      })),
    ],
    detachments: ['old~cat', 'current~cat'].map((catalogueId) => ({
      catalogueId,
      faction: 'Codex',
      factionSlug: 'codex',
      id: 'gladius',
      slug: 'gladius-task-force',
      name: 'Gladius Task Force',
    })),
    ruleDocuments: [],
    issues: [],
  } as unknown as CanonicalCatalogue
  const corpus: ReferenceCorpus = { catalogue, documents: [], byId: new Map(), revision: 'snapshot' }

  const planned = referenceUnits(corpus, loaded, null, 'chapter', undefined, 'Gladius Task Force', new Set(['cat-1', 'current~cat']))
  expect(planned?.detachment).toMatchObject({ id: 'gladius', catalogueId: 'current~cat' })
  expect(planned?.units.find((unit) => unit.name === 'Intercessors')?.referenceId).toBe('datasheet:current~cat:intercessors')
})

it("cites an allied unit's page under the faction that owns it, not another faction's copy", () => {
  const loaded = shelfOf(
    { catalogueLinks: [{ targetId: 'cat-1', importRootEntries: true }] },
    { selectionEntries: [{ id: 'assassin', name: 'Assassin', type: 'unit' }] },
  )
  const sheet = (catalogueId: string, route: string) => ({
    id: 'assassin',
    slug: 'assassin',
    catalogueId,
    faction: route,
    referenceRoute: { catalogueId: route, slug: 'assassin' },
    attachments: [],
    leaders: [],
    supporters: [],
  })
  const catalogue = {
    datasheets: [{ ...sheet('cat', 'army'), id: 'trooper' }, sheet('cat-1', 'agents'), sheet('mfm~cat-2', 'marines')],
    detachments: [],
  } as unknown as CanonicalCatalogue
  const corpus: ReferenceCorpus = { catalogue, documents: [], byId: new Map(), revision: 'snapshot' }

  expect(
    referenceUnits(corpus, loaded, null, 'army', undefined, undefined, new Set(['cat', 'cat-1', 'mfm~cat-2']))?.units.find(
      (unit) => unit.name === 'Assassin',
    )?.referenceId,
  ).toBe('datasheet:agents:assassin')
})

it('connects a primary mission to its terrain and deployment records', () => {
  const catalogue = {
    format: 'praetorium.canonical-catalogue.v1',
    compilerVersion: 1,
    revisions: {},
    datasheets: [],
    detachments: [],
    ruleDocuments: [],
    issues: [],
  } as CanonicalCatalogue
  const documents = [
    {
      id: 'mission:pack:mission',
      kind: 'mission' as const,
      title: 'Mission',
      faction: null,
      url: '/missions/pack/matchups/one/two',
      sections: [],
      revisions: {},
      attribution: [],
    },
    {
      id: 'terrain:layout',
      kind: 'terrain' as const,
      title: 'Layout',
      faction: null,
      url: '/missions/pack/matchups/one/two#terrain-layout',
      sections: [],
      revisions: {},
      attribution: [],
    },
    {
      id: 'deployment:deployment',
      kind: 'deployment' as const,
      title: 'Deployment',
      faction: null,
      url: '/missions/pack/matchups/one/two#deployment-deployment',
      sections: [],
      revisions: {},
      attribution: [],
    },
  ]
  const corpus: ReferenceCorpus = {
    catalogue,
    documents,
    byId: new Map(documents.map((document) => [document.id, document])),
    revision: 'snapshot',
  }
  const rules = {
    attribution: 'Community data',
    dispositions: new Map([
      ['one', 'One'],
      ['two', 'Two'],
    ]),
    dispositionDetails: [
      { id: 'one', name: 'One', text: null },
      { id: 'two', name: 'Two', text: null },
    ],
    missions: new Map([
      [
        'pack|one|two',
        {
          id: 'mission',
          name: 'Mission',
          roundCap: null,
          gameCap: null,
          secondaryRoundCap: null,
          secondaryGameCap: null,
          source: 'Pack',
          packId: 'pack',
          deploymentIds: [],
        },
      ],
    ]),
    primaries: [],
    secondaries: [],
    missionTwists: new Map(),
    fixedSecondaryCaps: new Map(),
    deployments: [{ id: 'deployment', name: 'Deployment', description: null, zones: [], attackerTerritory: null, objectives: [] }],
    terrainLayouts: [
      {
        id: 'layout',
        name: 'Layout',
        description: null,
        matchupId: 'two-vs-one',
        variant: 1,
        deploymentId: 'deployment',
        pieces: [],
        geometry: null,
      },
    ],
  } as unknown as LoadedRules

  expect(referenceRecord(corpus, rules, 'mission:pack:mission')).toMatchObject({
    data: {
      setups: [
        {
          you: { id: 'one' },
          opponent: { id: 'two' },
          terrain: [{ id: 'layout', referenceId: 'terrain:layout' }],
          deployments: [{ id: 'deployment', referenceId: 'deployment:deployment' }],
        },
      ],
    },
  })
})

it('resolves an ordinary faction name to current rules even when an archive is listed first', () => {
  const catalogue = {
    datasheets: [
      {
        catalogueId: 'archive~book',
        faction: 'Marines · MFM 1.4 · Archived',
        referenceRoute: { catalogueId: 'archive~book', slug: 'unit' },
      },
      { catalogueId: 'current~book', faction: 'Marines · MFM 1.5', referenceRoute: { catalogueId: 'current~book', slug: 'unit' } },
    ],
    detachments: [],
  } as unknown as CanonicalCatalogue
  expect(referenceFaction({ catalogue } as ReferenceCorpus, 'marines')?.id).toBe('current~book')
})

it.each(['Tau Empire', "T'au Empire"])('resolves %s to the faction however its apostrophe is typed', (name) => {
  const catalogue = {
    datasheets: [{ catalogueId: 'tau', faction: 'T’au Empire', referenceRoute: { catalogueId: 'tau-empire', slug: 'unit' } }],
    detachments: [],
  } as unknown as CanonicalCatalogue
  expect(referenceFaction({ catalogue } as ReferenceCorpus, name)?.id).toBe('tau')
})

it('reads a datasheet record from an id its slug has since moved from', () => {
  const sheet = { id: 'd7e1-13bb-2177-b6bc', slug: 'watch-master', catalogueId: 'cat', name: 'Watch Master' } as CanonicalDatasheet
  const catalogue = { datasheets: [sheet], detachments: [] } as unknown as CanonicalCatalogue
  const document = {
    id: 'datasheet:cat:watch-master',
    kind: 'datasheet' as const,
    title: 'Watch Master',
    faction: 'Deathwatch',
    url: '/factions/deathwatch/datasheets/watch-master',
    sections: [],
    revisions: {},
    attribution: [],
  }
  const corpus: ReferenceCorpus = { catalogue, documents: [document], byId: new Map([[document.id, document]]), revision: 'snapshot' }

  expect(referenceRecord(corpus, null, 'datasheet:cat:watch-master-d7e1-13b')?.document.id).toBe('datasheet:cat:watch-master')
})

it('reads a datasheet record by the page another faction files it under', () => {
  const sheet = {
    id: 'captain-entry',
    slug: 'captain-captain-',
    catalogueId: 'chapter',
    name: 'Captain',
    referenceRoute: { catalogueId: 'space-marines', slug: 'captain' },
  } as CanonicalDatasheet
  const catalogue = { datasheets: [sheet], detachments: [] } as unknown as CanonicalCatalogue
  const document = {
    id: 'datasheet:space-marines:captain',
    kind: 'datasheet' as const,
    title: 'Captain',
    faction: 'Space Marines',
    url: '/factions/space-marines/datasheets/captain',
    sections: [],
    revisions: {},
    attribution: [],
  }
  const corpus: ReferenceCorpus = { catalogue, documents: [document], byId: new Map([[document.id, document]]), revision: 'snapshot' }

  expect(referenceRecord(corpus, null, 'datasheet:space-marines:captain')?.document.id).toBe('datasheet:space-marines:captain')
})
