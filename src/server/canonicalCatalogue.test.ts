import { describe, expect, it } from 'vitest'
import { bookOf, card, categories, points, withCards } from './catalogue.fixtures'
import { compileCanonicalCatalogue, compileCanonicalRuleDocuments } from './canonicalCatalogue'
import type { SourceUnit } from './catalogueSourceUnits'
import { indexExternalReferences } from './externalReferences'

const revisions = { definitions: 'definitions-revision', datacards: 'datacards-revision' }

function catalogue() {
  const loaded = bookOf({
    selectionEntries: [
      {
        id: 'squad',
        name: 'Squad',
        type: 'unit',
        costs: points(100),
        categoryLinks: categories('Infantry', 'Battleline'),
        profiles: [
          {
            id: 'unit',
            name: 'Squad',
            typeName: 'Unit',
            characteristics: [
              { name: 'T', $text: '4' },
              { name: 'Future stat', $text: '2+' },
            ],
          },
        ],
        selectionEntries: [
          {
            id: 'gun',
            name: 'Rifle',
            type: 'upgrade',
            profiles: [{ id: 'weapon', name: 'Rifle', typeName: 'Ranged Weapons', characteristics: [{ name: 'A', $text: '2' }] }],
          },
        ],
      },
    ],
  })
  const content = withCards('Test catalogue', new Map([['Squad', card({ composition: ['1 Squad'] })]]))
  loaded.factionContents.set('test-catalogue', content)
  loaded.datacards.factions.set('test-catalogue', content)
  return loaded
}

function withSourceUnit(loaded: ReturnType<typeof catalogue>, over: Partial<SourceUnit> = {}) {
  const unit: SourceUnit = {
    id: 'source-squad',
    name: 'Squad',
    keywords: ['Infantry'],
    factionKeywords: ['Test catalogue'],
    profiles: [{ name: 'Squad', values: { M: 6, T: 4 } }],
    points: [{ models: 5, modelsMax: null, cost: 100 }],
    modelCount: { min: 5, max: 10 },
    baseSize: { shape: 'round', diameter: 32, draft: false },
    ...over,
  }
  loaded.sourceUnits = new Map([['squad', [unit]]])
  loaded.sourceReferences.units = indexExternalReferences([{ id: unit.id, external_refs: [{ namespace: 'bsdata', id: 'squad' }] }])
  return loaded
}

describe('canonical catalogue', () => {
  it('compiles upstream labels into one typed datasheet with provenance', () => {
    const compiled = compileCanonicalCatalogue(catalogue(), revisions)

    expect(compiled.datasheets[0]).toMatchObject({
      catalogueId: 'cat',
      faction: 'Test catalogue',
      name: 'Squad',
      composition: ['1 Squad'],
      profiles: [
        {
          kind: 'unit',
          values: [
            { name: 'T', value: '4', kind: 'toughness' },
            { name: 'Future stat', value: '2+', kind: 'other' },
          ],
        },
        { kind: 'ranged-weapon', values: [{ name: 'A', value: '2', kind: 'attacks' }] },
      ],
      provenance: {
        definitions: { revision: 'definitions-revision', entryId: 'squad' },
        datacards: { revision: 'datacards-revision', resolution: 'normalized-name' },
        rules: null,
        fields: {
          keywords: { sources: ['definitions'], strategy: 'single-source' },
          abilities: { sources: ['definitions'], strategy: 'single-source' },
          relationships: { sources: ['definitions'], strategy: 'single-source' },
        },
      },
    })
  })

  it('reports uncertain joins and fields rather than guessing', () => {
    expect(compileCanonicalCatalogue(catalogue(), revisions).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'unclassified-characteristic', entryId: 'squad', path: '/profiles/0/values/1' }),
        expect.objectContaining({ kind: 'source-name-fallback', entryId: 'squad' }),
        expect.objectContaining({ kind: 'missing-source-record', entryId: 'squad', path: '/provenance/rules' }),
      ]),
    )
  })

  it('resolves safe display gaps from an exactly linked 40kdc unit', () => {
    const loaded = catalogue()
    loaded.factionContents.get('test-catalogue')!.datasheetDetails.get('Squad')!.composition = []
    const compiled = compileCanonicalCatalogue(withSourceUnit(loaded), { ...revisions, rules: 'rules-revision' })

    expect(compiled.datasheets[0]).toMatchObject({
      baseSize: '32mm',
      composition: ['5-10 models'],
      costs: [{ models: '5', cost: '100' }],
      attribution: expect.stringContaining('40kdc community contributors'),
      provenance: {
        rules: { revision: 'rules-revision', unitId: 'source-squad', resolution: 'external-reference' },
        fields: {
          baseSize: { sources: ['rules'], strategy: 'fallback' },
          composition: { sources: ['rules'], strategy: 'fallback' },
          costs: { sources: ['rules'], strategy: 'fallback' },
        },
      },
    })
    expect(compiled.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'source-field-fallback', path: '/baseSize' }),
        expect.objectContaining({ kind: 'source-field-fallback', path: '/composition' }),
        expect.objectContaining({ kind: 'source-field-fallback', path: '/costs' }),
      ]),
    )
  })

  it('does not publish draft source base sizes', () => {
    const compiled = compileCanonicalCatalogue(withSourceUnit(catalogue(), { baseSize: { shape: 'hull', draft: true } }), {
      ...revisions,
      rules: 'rules-revision',
    })

    expect(compiled.datasheets[0]?.baseSize).toBeNull()
    expect(compiled.issues).not.toContainEqual(expect.objectContaining({ kind: 'source-field-fallback', path: '/baseSize' }))
  })

  it('keeps the declared source priority and reports conflicting facts', () => {
    const loaded = catalogue()
    const content = loaded.factionContents.get('test-catalogue')!
    content.datasheetDetails.set(
      'Squad',
      card({
        baseSize: '40mm',
        points: [{ models: '5', cost: '90', keyword: null, faction: null, detachment: null }],
      }),
    )
    const compiled = compileCanonicalCatalogue(
      withSourceUnit(loaded, { name: 'Source Squad', profiles: [{ name: 'Squad', values: { T: 5 } }] }),
      {
        ...revisions,
        rules: 'rules-revision',
      },
    )

    expect(compiled.datasheets[0]).toMatchObject({
      points: 90,
      baseSize: '40mm',
      costs: [{ models: '5', cost: '90' }],
      provenance: {
        fields: {
          identity: { sources: ['definitions', 'rules'], strategy: 'source-priority' },
          points: { sources: ['definitions', 'datacards', 'rules'], strategy: 'source-priority' },
          keywords: { sources: ['definitions'], strategy: 'single-source' },
          baseSize: { sources: ['datacards', 'rules'], strategy: 'source-priority' },
          costs: { sources: ['datacards', 'rules'], strategy: 'source-priority' },
          relationships: { sources: ['definitions'], strategy: 'single-source' },
        },
      },
    })
    expect(compiled.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'source-field-conflict', path: '/baseSize' }),
        expect.objectContaining({ kind: 'source-field-conflict', path: '/costs' }),
        expect.objectContaining({ kind: 'source-field-conflict', path: '/name' }),
        expect.objectContaining({ kind: 'source-field-conflict', path: '/points' }),
        expect.objectContaining({ kind: 'source-field-conflict', path: '/profiles/0/values/0' }),
      ]),
    )
  })

  it('omits a summary point when the printed table has more than one unconditional price', () => {
    const loaded = catalogue()
    loaded.factionContents.get('test-catalogue')!.datasheetDetails.set(
      'Squad',
      card({
        points: [
          { models: '5', cost: '100', keyword: null, faction: null, detachment: null },
          { models: '10', cost: '180', keyword: null, faction: null, detachment: null },
        ],
      }),
    )

    expect(compileCanonicalCatalogue(loaded, revisions).datasheets[0]).toMatchObject({
      points: null,
      provenance: { fields: { points: { sources: ['definitions', 'datacards'], strategy: 'unresolved' } } },
    })
  })

  it('reports a source-specific profile type while preserving it for generic rendering', () => {
    const loaded = bookOf({
      selectionEntries: [
        {
          id: 'officer',
          name: 'Officer',
          type: 'unit',
          profiles: [{ id: 'orders', name: 'Take Aim', typeName: 'Orders', characteristics: [{ name: 'Orders', $text: 'Rule' }] }],
        },
      ],
    })

    expect(compileCanonicalCatalogue(loaded, revisions).issues).toContainEqual(
      expect.objectContaining({ kind: 'unclassified-profile', entryId: 'officer', path: '/profiles/0' }),
    )
  })

  it('includes the parsed rules structure and its source revision', () => {
    const compiled = compileCanonicalRuleDocuments(
      [
        {
          id: 'core',
          slug: 'core-rules',
          title: 'Core Rules',
          updated: null,
          sections: [],
        },
      ],
      'datacards-revision',
    )

    expect(compiled).toEqual([
      expect.objectContaining({
        id: 'core',
        provenance: { datacards: { revision: 'datacards-revision' } },
      }),
    ])
  })

  it('is deterministic for the same source snapshot', () => {
    const loaded = catalogue()
    expect(compileCanonicalCatalogue(loaded, revisions)).toEqual(compileCanonicalCatalogue(loaded, revisions))
  })
})
