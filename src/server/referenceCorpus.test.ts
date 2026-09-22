import { expect, it } from 'vitest'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import { referenceCorpusFor } from './referenceCorpus'
import type { LoadedRules } from './rules'

function canonical(revision: string, text: string): CanonicalCatalogue {
  return {
    format: 'praetorium.canonical-catalogue.v1',
    compilerVersion: 1,
    revisions: { datacards: revision },
    datasheets: [],
    detachments: [],
    ruleDocuments: [
      {
        id: 'core',
        slug: 'core',
        title: 'Core Rules',
        updated: null,
        sections: [
          {
            id: 'movement',
            slug: 'movement',
            title: 'Movement',
            entries: [
              {
                id: 'move',
                code: '1.1',
                anchor: '1.1',
                title: 'Move',
                blocks: [{ kind: 'prose', markup: text }],
                facts: [],
                cost: null,
                lore: null,
              },
            ],
          },
        ],
        provenance: { datacards: { revision } },
      },
    ],
    issues: [],
  }
}

it('rebuilds the corpus when the active snapshot is replaced', () => {
  let active = canonical('one', 'First snapshot.')
  const sources = { canonicalCatalogue: () => active, catalogue: () => null, rules: () => null }
  const before = referenceCorpusFor(sources)!
  active = canonical('two', 'Replacement snapshot.')
  const after = referenceCorpusFor(sources)!

  expect({ changed: after.revision !== before.revision, text: after.documents[0]?.sections[0]?.text }).toEqual({
    changed: true,
    text: '1.1\nReplacement snapshot.',
  })
})

it('changes the corpus identity when projected content changes at the same source revisions', () => {
  const before = canonical('one', 'First projection.')
  const after = canonical('one', 'Replacement projection.')

  expect(referenceCorpusFor({ canonicalCatalogue: () => after, catalogue: () => null, rules: () => null })!.revision).not.toBe(
    referenceCorpusFor({ canonicalCatalogue: () => before, catalogue: () => null, rules: () => null })!.revision,
  )
})

it('includes rule costs and lore in searchable and retrievable text', () => {
  const source = canonical('one', 'Rule text.')
  const entry = source.ruleDocuments[0]!.sections[0]!.entries[0]!
  entry.cost = 2
  entry.lore = 'A remembered victory guides the commander.'

  const document = referenceCorpusFor({ canonicalCatalogue: () => source, catalogue: () => null, rules: () => null })!.documents[0]!

  expect(document.sections[0]?.text).toContain('2 CP\nA remembered victory guides the commander.')
})

it('includes the force disposition matrix and primary mission scoring', () => {
  const rules = {
    attribution: 'Mission data attribution',
    dispositions: new Map([
      ['disruption', 'Disruption'],
      ['take-and-hold', 'Take and Hold'],
    ]),
    dispositionDetails: [
      { id: 'disruption', name: 'Disruption', text: 'Break the opposing force.' },
      { id: 'take-and-hold', name: 'Take and Hold', text: null },
    ],
    missions: new Map([
      [
        'chapter-approved-2026-2027|disruption|take-and-hold',
        {
          id: 'death-trap',
          name: 'Death Trap',
          roundCap: 15,
          gameCap: 45,
          secondaryRoundCap: 15,
          secondaryGameCap: 45,
          source: 'Chapter Approved 2026-2027',
          packId: 'chapter-approved-2026-2027',
          deploymentIds: ['hammer-and-anvil'],
        },
      ],
    ]),
    primaries: [
      {
        key: 'death-trap',
        name: 'Death Trap',
        text: null,
        awards: [
          {
            vp: 5,
            per: null,
            max: null,
            mode: null,
            group: null,
            cumulative: false,
            criteria: 'Trap an objective.',
            trigger: {
              timing: 'end-of-turn',
              phase: null,
              playerTurn: 'your-turn',
              roundMin: null,
              roundMax: null,
            },
          },
        ],
        actions: [],
        whenDrawn: null,
      },
    ],
    secondaries: [
      {
        key: 'behind-enemy-lines',
        name: 'Behind Enemy Lines',
        text: 'Reach the enemy deployment zone.',
        awards: [
          {
            vp: 4,
            per: null,
            max: null,
            mode: null,
            group: null,
            cumulative: false,
            criteria: 'One unit is wholly within the enemy deployment zone.',
            trigger: { timing: 'end-of-turn', phase: null, playerTurn: 'your-turn', roundMin: null, roundMax: null },
          },
        ],
        actions: [],
        whenDrawn: { operation: 'redraw', roundMax: 1, heldCards: ['engage-on-all-fronts'], condition: null },
      },
    ],
    missionTwists: new Map([
      ['chapter-approved-2026-2027', [{ id: 'fog-of-war', name: 'Fog of War', lore: null, rules: 'Visibility is limited.' }]],
    ]),
    fixedSecondaryCaps: new Map([['chapter-approved-2026-2027', 20]]),
    deployments: [
      {
        id: 'hammer-and-anvil',
        name: 'Hammer and Anvil',
        description: 'Deploy lengthways.',
        zones: [
          {
            player: 'attacker',
            name: 'Attacker zone',
            colour: '#ffffff',
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 1, y: 1 },
            ],
          },
        ],
        objectives: [{ x: 30, y: 22 }],
      },
    ],
    terrainLayouts: [
      {
        id: 'layout-a',
        name: 'Layout A',
        description: 'Symmetrical ruins.',
        matchupId: 'disruption-vs-take-and-hold',
        variant: 1,
        deploymentId: 'hammer-and-anvil',
        pieces: [
          {
            id: 'ruin-a',
            name: 'Ruin A',
            type: 'ruin',
            templateId: 'ruin',
            position: { x: 12, y: 8 },
            rotation: 90,
            mirror: null,
            parentAreaId: null,
          },
        ],
        geometry: { areas: [] },
      },
    ],
  } as unknown as LoadedRules

  const corpus = referenceCorpusFor({
    canonicalCatalogue: () => canonical('one', 'Rule text.'),
    catalogue: () => null,
    rules: () => rules,
  })!
  const document = corpus.byId.get('mission-pack:chapter-approved-2026-2027')!
  const mission = corpus.byId.get('mission:chapter-approved-2026-2027:death-trap')!
  const secondary = corpus.byId.get('mission:secondary:behind-enemy-lines')!
  const deployment = corpus.byId.get('deployment:hammer-and-anvil')!
  const terrain = corpus.byId.get('terrain:layout-a')!

  expect(document).toMatchObject({ kind: 'mission', title: 'Chapter Approved 2026-2027', url: '/mission-packs/chapter-approved-2026-2027' })
  expect(document.sections.find((entry) => entry.id === 'matrix')?.text).toContain('Disruption vs Take and Hold: Death Trap')
  expect(document.sections.find((entry) => entry.id === 'force-dispositions')?.text).toContain('Break the opposing force.')
  expect(document.sections.find((entry) => entry.id === 'mission-limits')?.text).toContain(
    'Each fixed secondary mission can score at most 20 VP.',
  )
  expect(document.sections.find((entry) => entry.id === 'twist-fog-of-war')?.text).toContain('Visibility is limited.')
  expect(mission.sections.find((entry) => entry.id === 'mission-death-trap')).toMatchObject({
    url: '/mission-matchups/chapter-approved-2026-2027/disruption/take-and-hold#mission-death-trap',
    text: expect.stringMatching(/Trap an objective\..*5 VP/s),
  })
  expect(secondary).toMatchObject({
    kind: 'mission',
    url: '/mission-packs/chapter-approved-2026-2027/secondary-missions/behind-enemy-lines',
    sections: [expect.objectContaining({ text: expect.stringMatching(/One unit is wholly within.*When drawn: redraw/s) })],
  })
  expect(deployment).toMatchObject({
    kind: 'deployment',
    url: expect.stringContaining('#deployment-hammer-and-anvil'),
    sections: [expect.objectContaining({ text: expect.stringContaining('1 objective markers.') })],
  })
  expect(terrain).toMatchObject({
    kind: 'terrain',
    url: expect.stringContaining('#terrain-layout-a'),
    sections: [expect.objectContaining({ text: expect.stringMatching(/Ruin A: ruin at 12, 8.*exact terrain areas/s) })],
  })
})

it('does not construct a reference without an active canonical snapshot', () => {
  expect(referenceCorpusFor({ canonicalCatalogue: () => null, catalogue: () => null, rules: () => null })).toBeNull()
})

it('stops serving a previously active snapshot when it is revoked', () => {
  let active: CanonicalCatalogue | null = canonical('one', 'First snapshot.')
  const sources = { canonicalCatalogue: () => active, catalogue: () => null, rules: () => null }

  expect(referenceCorpusFor(sources)).not.toBeNull()
  active = null
  expect(referenceCorpusFor(sources)).toBeNull()
})

it('keeps missing source descriptions explicit in bounded documents', () => {
  const source = canonical('one', 'Rule text.')
  source.detachments.push({
    catalogueId: 'test',
    faction: 'Test Faction',
    factionSlug: 'test',
    id: 'detachment',
    slug: 'detachment',
    name: 'Detachment',
    points: null,
    dispositions: [],
    rules: [{ name: 'Unknown Rule', description: null }],
    enhancements: [{ name: 'Unknown Enhancement', points: null, description: null }],
    upgrades: [],
    stratagems: [],
    keywordRules: [],
    attribution: 'Community data',
    provenance: {
      definitions: { revision: 'one', detachmentId: 'detachment' },
      rules: { revision: 'one' },
      datacards: { revision: 'one' },
    },
  })

  const document = referenceCorpusFor({ canonicalCatalogue: () => source, catalogue: () => null, rules: () => null })!.byId.get(
    'detachment:test:detachment',
  )!

  expect(document.sections.filter((entry) => entry.text === 'Description unavailable.').map((entry) => entry.id)).toEqual([
    'rule-unknown-rule',
    'enhancement-unknown-enhancement',
  ])
})
