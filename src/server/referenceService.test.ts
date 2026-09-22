import { expect, it } from 'vitest'
import type { CanonicalCatalogue, CanonicalDatasheet } from '../contracts/catalogue'
import { bookOf, points } from './catalogue.fixtures'
import type { ReferenceCorpus } from './referenceCorpus'
import { referenceRecord, referenceUnits } from './referenceService'
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
    datasheets: [sheet],
    detachments: [detachment],
    ruleDocuments: [],
    issues: [],
  }
  const corpus: ReferenceCorpus = { catalogue, documents: [], byId: new Map(), revision: 'snapshot' }

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
      url: '/mission-matchups/pack/one/two',
      sections: [],
      revisions: {},
      attribution: [],
    },
    {
      id: 'terrain:layout',
      kind: 'terrain' as const,
      title: 'Layout',
      faction: null,
      url: '/mission-matchups/pack/one/two#terrain-layout',
      sections: [],
      revisions: {},
      attribution: [],
    },
    {
      id: 'deployment:deployment',
      kind: 'deployment' as const,
      title: 'Deployment',
      faction: null,
      url: '/mission-matchups/pack/one/two#deployment-deployment',
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
    deployments: [{ id: 'deployment', name: 'Deployment', description: null, zones: [], objectives: [] }],
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
