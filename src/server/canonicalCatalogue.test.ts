import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ability, bookOf, card, categories, points, withCards } from './catalogue.fixtures'
import {
  CANONICAL_CATALOGUE_FORMAT,
  compileCanonicalCatalogue,
  compileCanonicalCatalogueFromSnapshot,
  compileCanonicalRuleDocuments,
  loadCanonicalCatalogue,
  referenceCatalogue,
} from './canonicalCatalogue'
import { DATACARDS_ATTRIBUTION, type DatasheetDetails } from './datacards'
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

describe('canonical catalogue', () => {
  it('attributes an overlaid Marine datasheet to its own pinned revision', () => {
    const loaded = catalogue()
    loaded.marineCodexCatalogueIds = new Set(['cat'])

    const sheet = compileCanonicalCatalogue(loaded, { ...revisions, marineCodex: 'marine-revision' }).datasheets[0]
    expect({
      provenance: sheet?.provenance.definitions,
      identity: sheet?.provenance.fields.identity,
      attribution: sheet?.attribution,
    }).toEqual({
      provenance: { revision: 'marine-revision', entryId: 'squad', source: 'marineCodex' },
      identity: { sources: ['marineCodex'], strategy: 'single-source' },
      attribution: `Provisional Space Marines codex data from richardsolomou/wh40k-11e. ${DATACARDS_ATTRIBUTION}`,
    })
  })

  it('prints MFM copy tiers and attributes their points to the pinned source', () => {
    const loaded = catalogue()
    loaded.mfm = new Map([
      [
        'test-catalogue',
        {
          slug: 'test-catalogue',
          version: '1.5',
          units: [
            {
              name: 'Squad',
              pricing: [
                { range: '[1,2]', label: 'Your 1st To 2nd Units Cost', costs: [{ models: 1, points: 90 }] },
                { range: '[3,)', label: 'Your 3rd + Unit Costs', costs: [{ models: 1, points: 105 }] },
              ],
            },
          ],
        },
      ],
    ])
    const sheet = compileCanonicalCatalogue(loaded, { ...revisions, points: 'mfm-1.5' }).datasheets[0]
    expect({ costs: sheet?.costs, provenance: sheet?.provenance.fields.costs }).toEqual({
      costs: [
        { models: '1', cost: '90', keyword: null, faction: null, detachment: null, copies: 'Your 1st To 2nd Units Cost' },
        { models: '1', cost: '105', keyword: null, faction: null, detachment: null, copies: 'Your 3rd + Unit Costs' },
      ],
      provenance: { sources: ['points'], strategy: 'single-source' },
    })
  })
  it('attributes a newer card profile when older sources disagree', () => {
    const loaded = catalogue()
    loaded.profiledSupplementIds.add('cat')
    loaded.factionContents
      .get('test-catalogue')!
      .datasheetDetails.set('Squad', card({ profiles: [{ name: 'Squad', type: 'Unit', values: { T: '10' } }] }))
    const compiled = compileCanonicalCatalogue(loaded, revisions)

    expect(compiled.datasheets[0]?.profiles[0]?.values[0]?.value).toBe('10')
    expect(compiled.datasheets[0]?.provenance.fields.profiles).toEqual({
      sources: ['definitions', 'datacards'],
      strategy: 'source-priority',
    })
  })

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

    expect(sheet?.provenance.fields.abilities.sources).toEqual(['definitions', 'datacards'])
    expect(sheet?.attribution).toBe(RULES_DATA_ATTRIBUTION)
  })

  it('reports uncertain joins and fields rather than guessing', () => {
    expect(compileCanonicalCatalogue(catalogue(), revisions).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'unclassified-characteristic', entryId: 'squad', path: '/profiles/0/values/1' }),
        expect.objectContaining({ kind: 'source-name-fallback', entryId: 'squad' }),
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
                      $text: 'This model can be attached to the following units:\n■ OLD GUARD [LEGENDS]\n■ CURRENT\u00a0GUARD',
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

  it('compiles reference detachments beside datasheets and rules', () => {
    const loaded = bookOf({
      selectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          categoryLinks: categories('Faction: Test catalogue'),
        },
      ],
      sharedSelectionEntries: [
        {
          id: 'wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            {
              id: 'choices',
              name: 'Detachment',
              selectionEntries: [{ id: 'vanguard', name: 'Vanguard', type: 'upgrade' }],
            },
          ],
        },
      ],
    })
    const rules = {
      attribution: 'Community data',
      factionKeys: new Map(),
      factionNames: new Map(),
      detachmentReferences: new Map([
        ['test-catalogue', new Map([['vanguard', { enhancements: 0, upgrades: 0, stratagems: 0, points: 1, dispositions: [] }]])],
      ]),
      detachmentDetails: new Map([
        [
          'test-catalogue',
          new Map([
            [
              'vanguard',
              {
                id: 'vanguard',
                name: 'Vanguard',
                points: 1,
                dispositions: [],
                rules: [{ name: 'Shadow Masters', description: 'Remain concealed.' }],
                enhancements: [],
                upgrades: [],
                stratagems: [],
              },
            ],
          ]),
        ],
      ]),
      dispositions: new Map(),
      ruleDocuments: [],
    } as Partial<LoadedRules> as LoadedRules

    expect(compileCanonicalCatalogue(loaded, { ...revisions, rules: 'rules-revision' }, rules).detachments).toEqual([
      expect.objectContaining({
        catalogueId: 'cat',
        faction: 'Test catalogue',
        slug: 'vanguard',
        rules: [{ name: 'Shadow Masters', description: 'Remain concealed.' }],
        provenance: {
          definitions: { revision: 'definitions-revision', detachmentId: 'vanguard', source: 'definitions' },
          datacards: { revision: 'datacards-revision' },
        },
      }),
    ])
  })

  it('is deterministic for the same source snapshot', () => {
    const loaded = catalogue()
    expect(compileCanonicalCatalogue(loaded, revisions)).toEqual(compileCanonicalCatalogue(loaded, revisions))
  })

  it('compiles an installed legacy snapshot when its canonical projection is absent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-canonical-legacy-'))
    try {
      fs.writeFileSync(path.join(root, 'revision.json'), `${JSON.stringify(revisions)}\n`)

      expect(compileCanonicalCatalogueFromSnapshot(catalogue(), null, root)).toMatchObject({
        revisions,
        datasheets: [expect.objectContaining({ name: 'Squad' })],
      })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([
    { scenario: 'uses a current local projection', localRevision: 'definitions-revision', compilerVersion: 2, expected: 101 },
    { scenario: 'ignores a local projection from another snapshot', localRevision: 'older-revision', compilerVersion: 2, expected: 100 },
    {
      scenario: 'ignores a local projection from an older compiler',
      localRevision: 'definitions-revision',
      compilerVersion: 1,
      expected: 100,
    },
  ])('$scenario', ({ localRevision, compilerVersion, expected }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-canonical-local-'))
    const localFile = path.join(root, 'working.json')
    try {
      const packaged = compileCanonicalCatalogue(catalogue(), revisions)
      const working = {
        ...packaged,
        compilerVersion,
        revisions: { ...packaged.revisions, definitions: localRevision },
        datasheets: packaged.datasheets.map((sheet) => ({ ...sheet, points: 101 })),
      }
      fs.mkdirSync(path.join(root, 'canonical'))
      fs.writeFileSync(path.join(root, 'revision.json'), JSON.stringify(revisions))
      fs.writeFileSync(path.join(root, 'canonical', 'catalogue.json'), JSON.stringify(packaged))
      fs.writeFileSync(localFile, JSON.stringify(working))
      vi.stubEnv('PRAETORIUM_LOCAL_DEV', 'true')
      vi.stubEnv('LOCAL_TEST_MODE', 'false')
      vi.stubEnv('LOCAL_CANONICAL_FILE', localFile)

      expect(
        referenceCatalogue(
          root,
          () => null,
          () => null,
        )?.datasheets[0]?.points,
      ).toBe(expected)
    } finally {
      vi.unstubAllEnvs()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('recompiles an older packaged catalogue from its verified sources in production', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-canonical-compiler-'))
    try {
      const source = catalogue()
      const packaged = compileCanonicalCatalogue(source, revisions)
      fs.mkdirSync(path.join(root, 'canonical'))
      fs.writeFileSync(path.join(root, 'revision.json'), JSON.stringify(revisions))
      fs.writeFileSync(
        path.join(root, 'canonical', 'catalogue.json'),
        JSON.stringify({
          ...packaged,
          compilerVersion: 1,
          datasheets: packaged.datasheets.map((sheet) => ({ ...sheet, points: 999 })),
        }),
      )
      vi.stubEnv('PRAETORIUM_LOCAL_DEV', 'false')
      const result = referenceCatalogue(
        root,
        () => source,
        () => null,
      )
      expect({ compilerVersion: result?.compilerVersion, points: result?.datasheets[0]?.points }).toEqual({
        compilerVersion: 2,
        points: 100,
      })
    } finally {
      vi.unstubAllEnvs()
      fs.rmSync(root, { recursive: true, force: true })
    }
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
