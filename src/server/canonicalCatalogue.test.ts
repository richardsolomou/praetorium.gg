import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ability, bookOf, card, categories, points, withCards } from './catalogue.fixtures'
import {
  CANONICAL_CATALOGUE_FORMAT,
  compileCanonicalCatalogue,
  compileCanonicalRuleDocuments,
  loadCanonicalCatalogue,
} from './canonicalCatalogue'
import type { SourceUnit } from './catalogueSourceUnits'
import { DATACARDS_ATTRIBUTION, type DatasheetDetails } from './datacards'
import { indexExternalReferences } from './externalReferences'
import { type LoadedRules, RULES_DATA_ATTRIBUTION } from './rules'

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

function compileWithSourceUnit(
  loaded: ReturnType<typeof catalogue>,
  over: Partial<SourceUnit> = {},
  sourceRevisions: Record<string, string> = { ...revisions, rules: 'rules-revision' },
) {
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
  loaded.sourceReferences.units = indexExternalReferences([{ id: unit.id, external_refs: [{ namespace: 'bsdata', id: 'squad' }] }])
  return compileCanonicalCatalogue(loaded, sourceRevisions, null, new Map([['squad', [unit]]]))
}

describe('canonical catalogue', () => {
  it('compiles upstream labels into one typed datasheet with provenance', () => {
    const compiled = compileCanonicalCatalogue(catalogue(), revisions)

    expect(compiled.datasheets[0]).toMatchObject({
      catalogueId: 'cat',
      faction: 'Test catalogue',
      name: 'Squad',
      attribution: DATACARDS_ATTRIBUTION,
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

  it.each([
    ['base size', { baseSize: '32mm' }],
    ['composition', { composition: ['1 Squad'] }],
    ['costs', { points: [{ models: '1', cost: '100', keyword: null, faction: null, detachment: null }] }],
    ['loadout', { loadout: 'This unit is equipped with one rifle.' }],
    ['transport', { transport: 'This model can transport 6 models.' }],
    ['wargear', { wargear: ['One rifle'] }],
    ['wargear groups', { wargearGroups: [{ instruction: 'Choose one.', options: ['One rifle'] }] }],
  ] as [string, Partial<DatasheetDetails>][])('attributes Game Datacards when it solely supplies %s', (_, details) => {
    const loaded = catalogue()
    loaded.factionContents.get('test-catalogue')!.datasheetDetails.set('Squad', card(details))

    expect(compileCanonicalCatalogue(loaded, revisions).datasheets[0]?.attribution).toBe(DATACARDS_ATTRIBUTION)
  })

  it('attributes a rules-backed ability reclassification', () => {
    const loaded = bookOf({
      selectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          costs: points(100),
          categoryLinks: categories('Faction: Test catalogue'),
          selectionEntries: [
            {
              id: 'upgrade',
              name: 'Death in the Dark',
              type: 'upgrade',
              profiles: [ability('upgrade-ability', 'Death in the Dark')],
            },
          ],
        },
      ],
    })
    const rules = {
      abilityDescriptions: new Map(),
      factionKeys: new Map(),
      factionNames: new Map(),
      ruleDocuments: [],
      detachmentDetails: new Map([
        [
          'test-catalogue',
          new Map([
            [
              'detachment',
              {
                id: 'detachment',
                name: 'Detachment',
                points: null,
                dispositions: [],
                rules: [],
                enhancements: [],
                upgrades: [{ name: 'Death in the Dark', points: 15, description: 'Strike from concealment.' }],
                stratagems: [],
              },
            ],
          ]),
        ],
      ]),
    } as Partial<LoadedRules> as LoadedRules

    const sheet = compileCanonicalCatalogue(loaded, revisions, rules).datasheets[0]

    expect(sheet?.provenance.fields.abilities.sources).toEqual(['definitions', 'rules'])
    expect(sheet?.attribution).toBe(RULES_DATA_ATTRIBUTION)
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
    const compiled = compileWithSourceUnit(loaded)

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
    const compiled = compileWithSourceUnit(catalogue(), { baseSize: { shape: 'hull', draft: true } })

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
    const compiled = compileWithSourceUnit(loaded, {
      name: 'Source Squad',
      profiles: [{ name: 'Squad', values: { T: 5 } }],
    })

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

  it('reports a composition conflict while keeping Game Datacards presentation', () => {
    const loaded = catalogue()
    loaded.factionContents
      .get('test-catalogue')!
      .datasheetDetails.set('Squad', card({ composition: ['**1 Squad Leader and 9 Squad models**'] }))

    const compiled = compileWithSourceUnit(loaded, { modelCount: { min: 10, max: 20 } })

    expect(compiled.datasheets[0]?.composition).toEqual(['**1 Squad Leader and 9 Squad models**'])
    expect(compiled.issues).toContainEqual(expect.objectContaining({ kind: 'source-field-conflict', path: '/composition' }))
  })

  it('does not read digits embedded in a model name as a composition count', () => {
    const loaded = catalogue()
    loaded.factionContents.get('test-catalogue')!.datasheetDetails.set('Squad', card({ composition: ['**1 XV8 Crisis Battlesuit**'] }))

    const compiled = compileWithSourceUnit(loaded, { modelCount: { min: 1, max: 1 } })

    expect(compiled.issues).not.toContainEqual(expect.objectContaining({ kind: 'source-field-conflict', path: '/composition' }))
  })

  it('does not link relationships to datasheets omitted from the canonical catalogue', () => {
    const loaded = bookOf({
      name: 'Test catalogue',
      selectionEntries: [
        {
          id: 'leader',
          name: 'Leader',
          type: 'model',
          costs: points(100),
          categoryLinks: categories('Faction: Test catalogue'),
          infoGroups: [
            {
              id: 'leader-group',
              name: 'Leader',
              profiles: [
                {
                  id: 'leader-profile',
                  name: 'Leader',
                  characteristics: [
                    {
                      name: 'Description',
                      $text: 'This model can be attached to the following units:\n■ OLD GUARD [LEGENDS]\n■ CURRENT GUARD',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'old-guard',
          name: 'Old Guard [Legends]',
          type: 'unit',
          costs: points(100),
          categoryLinks: categories('Faction: Test catalogue'),
        },
        {
          id: 'current-guard',
          name: 'Current Guard',
          type: 'unit',
          costs: points(100),
          categoryLinks: categories('Faction: Test catalogue'),
        },
      ],
    })

    const attachments = compileCanonicalCatalogue(loaded, revisions).datasheets.find((sheet) => sheet.id === 'leader')?.attachments
    expect(attachments).toContainEqual(expect.objectContaining({ name: 'OLD GUARD [LEGENDS]', route: null }))
    expect(attachments).toContainEqual(
      expect.objectContaining({ name: 'Current Guard', route: { catalogueId: 'test-catalogue', slug: 'current-guard' } }),
    )
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

  it('is byte-identical across publisher locales', () => {
    const root = path.join(import.meta.dirname, '../..')
    const script = `
      import { bookOf, categories, points } from './src/server/catalogue.fixtures.ts'
      import { compileCanonicalCatalogue } from './src/server/canonicalCatalogue.ts'
      const loaded = bookOf({
        name: 'Test catalogue',
        selectionEntries: [
          {
            id: 'leader',
            name: 'Leader',
            type: 'model',
            costs: points(100),
            categoryLinks: categories('Faction: Test catalogue'),
            infoGroups: [{
              id: 'leader-group',
              name: 'Leader',
              profiles: [{
                id: 'leader-profile',
                name: 'Leader',
                characteristics: [{
                  name: 'Description',
                  $text: 'This model can be attached to the following units:\\n■ IMPERIAL GUARD',
                }],
              }],
            }],
          },
          {
            id: 'guard',
            name: 'Imperial Guard',
            type: 'unit',
            costs: points(100),
            categoryLinks: categories('Faction: Test catalogue'),
          },
        ],
      })
      process.stdout.write(JSON.stringify(compileCanonicalCatalogue(loaded, { definitions: 'definitions-revision' })))
    `
    const compile = (locale: string) =>
      execFileSync('pnpm', ['tsx', '-e', script], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, LC_ALL: locale },
      })

    expect(compile('tr_TR.UTF-8')).toBe(compile('C.UTF-8'))
  })

  it('falls back when a snapshot carries a newer canonical format', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-canonical-format-'))
    try {
      fs.mkdirSync(path.join(root, 'canonical'))
      fs.writeFileSync(path.join(root, 'canonical', 'catalogue.json'), '{"format":"praetorium.canonical-catalogue.v2"}\n')

      expect(loadCanonicalCatalogue(root)).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a malformed catalogue in the supported format', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-canonical-format-'))
    try {
      fs.mkdirSync(path.join(root, 'canonical'))
      fs.writeFileSync(
        path.join(root, 'canonical', 'catalogue.json'),
        `${JSON.stringify({ format: CANONICAL_CATALOGUE_FORMAT, compilerVersion: 1 })}\n`,
      )

      expect(() => loadCanonicalCatalogue(root)).toThrow()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
