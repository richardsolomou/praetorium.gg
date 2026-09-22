import { expect, it } from 'vitest'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import type { ReferenceDocument } from '../contracts/reference'
import type { ReferenceCorpus } from './referenceCorpus'
import { searchReference } from './referenceSearch'

const documents: ReferenceDocument[] = [
  {
    id: 'rule:core:movement',
    kind: 'rule',
    title: 'Move Units',
    faction: null,
    url: '/rules/core/movement#move',
    sections: [{ id: 'move', title: 'Move Units', text: 'A model cannot move across enemy models.', url: '/rules/core/movement#move' }],
    revisions: { datacards: 'rules-revision' },
    attribution: ['Rules source'],
  },
  {
    id: 'detachment:marines:vanguard',
    kind: 'detachment',
    title: 'Vanguard Spearhead',
    faction: 'Space Marines',
    url: '/factions/space-marines/detachments/vanguard',
    sections: [
      {
        id: 'enhancement-ghostweave-cloak',
        title: 'Ghostweave Cloak',
        text: 'The bearer has the Stealth ability.',
        url: '/factions/space-marines/detachments/vanguard#enhancement-ghostweave-cloak',
      },
    ],
    revisions: { rules: 'rules-revision' },
    attribution: ['Rules source'],
  },
  {
    id: 'datasheet:marines:scouts',
    kind: 'datasheet',
    title: 'Scout Squad',
    faction: 'Space Marines',
    url: '/factions/space-marines/datasheets/scouts',
    sections: [
      {
        id: 'ability-infiltrators',
        title: 'Infiltrators',
        text: 'This unit can be set up anywhere on the battlefield more than 9 inches away.',
        url: '/factions/space-marines/datasheets/scouts#ability-infiltrators',
      },
    ],
    revisions: { definitions: 'definitions-revision' },
    attribution: ['Catalogue source'],
  },
]
const catalogue: CanonicalCatalogue = {
  format: 'praetorium.canonical-catalogue.v1',
  compilerVersion: 1,
  revisions: { definitions: 'definitions-revision' },
  datasheets: [],
  detachments: [],
  ruleDocuments: [],
  issues: [],
}

const corpus: ReferenceCorpus = {
  catalogue,
  documents,
  byId: new Map(documents.map((document) => [document.id, document])),
  revision: 'snapshot',
}

it('finds prose and returns its addressable source excerpt', () => {
  expect(searchReference(corpus, { query: 'set up anywhere battlefield' }).results[0]).toMatchObject({
    id: 'datasheet:marines:scouts',
    section: { id: 'ability-infiltrators' },
    excerpt: expect.stringContaining('set up anywhere'),
  })
})

it('ranks an exact section name ahead of a prose mention', () => {
  expect(searchReference(corpus, { query: 'Ghostweave Cloak' }).results[0]?.id).toBe('detachment:marines:vanguard')
})

it('applies kind and faction filters without crossing content boundaries', () => {
  expect(searchReference(corpus, { query: 'ability', kinds: ['datasheet'], faction: 'Space Marines' }).results[0]?.kind).toBe('datasheet')
  expect(searchReference(corpus, { query: 'ability', kinds: ['detachment'], faction: 'Space Marines' }).results[0]?.kind).toBe('detachment')
})

it('finds a stable document id at its canonical section', () => {
  expect(searchReference(corpus, { query: 'rule:core:movement' }).results[0]).toMatchObject({
    id: 'rule:core:movement',
    section: { id: 'move' },
  })
})

it('matches a one-character typo in a title', () => {
  expect(searchReference(corpus, { query: 'move unitz' }).results[0]?.id).toBe('rule:core:movement')
})

it('matches plural variants', () => {
  expect(searchReference(corpus, { query: 'scout squads' }).results[0]?.id).toBe('datasheet:marines:scouts')
})

it('keeps identical prose inside the requested faction', () => {
  const mirrored = {
    ...documents[2]!,
    id: 'datasheet:chaos:scouts',
    faction: 'Chaos Space Marines',
    url: '/factions/chaos/datasheets/scouts',
  }
  const isolated = { ...corpus, documents: [...documents, mirrored] }

  expect(searchReference(isolated, { query: 'set up anywhere', faction: 'Chaos Space Marines' }).results[0]?.id).toBe(
    'datasheet:chaos:scouts',
  )
})

it('scores a repeated normalized term once', () => {
  const repeated = Array.from({ length: 40 }, () => 'alpha').join(' ')
  const repeatedDocuments: ReferenceDocument[] = [
    {
      id: 'rule:core:heading',
      kind: 'rule',
      title: 'Heading match',
      faction: null,
      url: '/rules/core/heading',
      sections: [{ id: 'heading', title: repeated, text: 'alpha', url: '/rules/core/heading#heading' }],
      revisions: {},
      attribution: [],
    },
    {
      id: 'rule:core:title',
      kind: 'rule',
      title: 'Alpha',
      faction: null,
      url: '/rules/core/title',
      sections: [{ id: 'title', title: 'Other', text: 'alpha', url: '/rules/core/title#title' }],
      revisions: {},
      attribution: [],
    },
  ]

  expect(searchReference({ ...corpus, documents: repeatedDocuments }, { query: repeated, limit: 1 }).results[0]?.id).toBe(
    'rule:core:heading',
  )
})
