import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { vsDataReleaseFiles, writeFiles } from './vsData.fixtures'
import { checkVsDataRelease, compactVsDataRelease, vsDataReleaseErrors } from './vsDataRelease'

const record = { kind: 'ability', id: 'necrons.test.phase-shift', aliases: [], summary: 'Move one unit.' }
let directory: string

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-data-release-'))
  writeFiles(directory, vsDataReleaseFiles([record]))
})
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

it('accepts a release holding exactly what its manifest lists', () => {
  expect(vsDataReleaseErrors(directory)).toEqual([])
})

it('refuses a record whose bytes differ from the manifest', () => {
  fs.appendFileSync(path.join(directory, 'records/rules-reference/ability/necrons.test.phase-shift.json'), ' ')
  expect(vsDataReleaseErrors(directory)).toEqual(['records/rules-reference/ability/necrons.test.phase-shift.json: checksum mismatch'])
})

it('refuses a file the manifest does not list', () => {
  fs.writeFileSync(path.join(directory, 'records/extra.json'), '{}')
  expect(vsDataReleaseErrors(directory)).toEqual(['records/extra.json: not listed in the manifest'])
})

it('refuses a symbolic link inside the release', () => {
  fs.symlinkSync('/etc/hosts', path.join(directory, 'records/link.json'))
  expect(vsDataReleaseErrors(directory)).toEqual(['records/link.json: not a regular file'])
})

it('refuses a release for an MFM no rules version plays', () => {
  fs.rmSync(directory, { recursive: true })
  writeFiles(directory, vsDataReleaseFiles([record], 'MFM 1.5'))
  expect(() => checkVsDataRelease(directory, [{ id: 'mfm-1-6', name: 'MFM 1.6' }])).toThrow(
    'describes 11th MFM 1.5, which no rules version plays',
  )
})

it('keeps the credit each adapted record names, once', () => {
  const credit = {
    credit: 'A data project',
    url: 'https://example.com/data',
    licence: 'https://creativecommons.org/licenses/by/4.0/legalcode',
  }
  fs.rmSync(directory, { recursive: true })
  writeFiles(
    directory,
    vsDataReleaseFiles([
      { ...record, attribution: credit },
      { ...record, id: 'necrons.test.other', attribution: credit },
    ]),
  )
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).attributions).toEqual([credit])
})

it('keeps each Stratagem’s typed facts, naming the Detachment it references', () => {
  fs.rmSync(directory, { recursive: true })
  const stratagem = {
    kind: 'ability',
    id: 'adeptus-custodes.shadowkeepers.no-escape',
    aliases: [],
    summary: 'No escape.',
    data: {
      ruleType: 'stratagem',
      cp: 1,
      detachment: { kind: 'detachment', id: 'adeptus-custodes.shadowkeepers' },
      stratagem: {
        phases: ['shooting', 'fight'],
        turn: 'any',
        windows: [
          { phase: 'shooting', turn: 'opponent' },
          { phase: 'fight', turn: 'any' },
        ],
      },
      facts: { format: 'vs-data-facts', version: '1', fields: { stratagem: { limit: 'battle' } } },
    },
  }
  writeFiles(
    directory,
    vsDataReleaseFiles([stratagem], 'MFM 1.6', [{ kind: 'detachment', id: 'adeptus-custodes.shadowkeepers', name: 'Shadowkeepers' }]),
  )
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  const [kept] = JSON.parse(fs.readFileSync(file, 'utf8')).stratagems
  expect([kept.detachment, kept.limit, kept.windows.length]).toEqual(['Shadowkeepers', 'battle', 2])
})

it('keeps what each Detachment’s build prints, by the Detachment’s name', () => {
  fs.rmSync(directory, { recursive: true, force: true })
  const detachment = {
    kind: 'detachment',
    id: 'space-marines.ironstorm-spearhead',
    name: 'Ironstorm Spearhead',
    aliases: [],
    category: 'rosters',
    data: {
      stratagems: ['space-marines.medusas-wrath.ancient-fury'],
      stratagemsUnlisted: ['Mercy Is Weakness'],
      enhancements: ['space-marines.medusas-wrath.adept-of-the-omnissiah'],
      enhancementsUnlisted: ['Master of Machine War'],
    },
  }
  writeFiles(directory, vsDataReleaseFiles([record, detachment], 'MFM 1.4'))
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).detachments).toEqual([
    {
      name: 'Ironstorm Spearhead',
      stratagems: ['space-marines.medusas-wrath.ancient-fury'],
      stratagemsUnlisted: ['Mercy Is Weakness'],
      enhancements: ['space-marines.medusas-wrath.adept-of-the-omnissiah'],
      enhancementsUnlisted: ['Master of Machine War'],
    },
  ])
})

it('keeps a Detachment the identity marks absent from the build as absent', () => {
  fs.rmSync(directory, { recursive: true, force: true })
  const absent = { kind: 'detachment', id: 'space-marines.tactical-brethren', name: 'Tactical Brethren', absent: true as const }
  writeFiles(directory, vsDataReleaseFiles([record], 'MFM 1.4', [absent]))
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).detachments).toEqual([
    { name: 'Tactical Brethren', absent: true, stratagems: [], stratagemsUnlisted: [], enhancements: [], enhancementsUnlisted: [] },
  ])
})

it('keeps what a datasheet shows of a unit, its models and wargear named, under its BSData alias', () => {
  const roster = (kind: string, id: string, data: unknown, name = id) => ({ kind, id, name, aliases: [], category: 'rosters', data })
  const files = vsDataReleaseFiles([
    record,
    { ...roster('unit', 'necrons.ghost-ark', { sizes: [1] }), aliases: ['bsdata.aa11.bb22'] },
    roster(
      'model',
      'necrons.ghost-ark.ghost-ark',
      { unit: 'necrons.ghost-ark', min: 1, max: 1, wargear: { 'necrons.ghost-ark.gauss-flayer-array': 2 } },
      'Ghost Ark',
    ),
    roster('wargear', 'necrons.ghost-ark.gauss-flayer-array', {}, 'Gauss flayer array'),
    {
      kind: 'transport-profile',
      id: 'necrons.ghost-ark',
      aliases: [],
      category: 'profiles',
      data: { unit: 'necrons.ghost-ark', capacity: { loads: [[{ count: 'models', limit: 10, selectors: ['NECRON WARRIORS'] }]] } },
    },
  ])
  fs.rmSync(directory, { recursive: true })
  writeFiles(directory, files)
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  const compact = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.rmSync(file)
  expect([compact.entries['unit:necrons.ghost-ark'], compact.units['necrons.ghost-ark']]).toEqual([
    ['bsdata.aa11.bb22'],
    {
      sizes: [1],
      models: [{ name: 'Ghost Ark', min: 1, max: 1, wargear: [['Gauss flayer array', 2]] }],
      options: [],
      transport: { loads: [[{ count: 'models', limit: 10, selectors: ['NECRON WARRIORS'] }]] },
    },
  ])
})

it('keeps every spelling the localisation gives a unit, its pieces and a Detachment, English first', () => {
  fs.rmSync(directory, { recursive: true })
  const entries = [
    { kind: 'unit', id: 'necrons.tomb-blades', name: 'Tomb Blades', aliases: ['bsdata.aa11.bb22'] },
    { kind: 'model', id: 'necrons.tomb-blades.tomb-blade', name: 'Tomb Blade', references: [{ kind: 'unit', id: 'necrons.tomb-blades' }] },
    // Offered only through a bundle, so only its ID places it under the unit.
    { kind: 'wargear', id: 'necrons.tomb-blades.particle-beamer', name: 'Particle Beamer' },
    { kind: 'detachment', id: 'necrons.pantheon-of-woe', name: 'Pantheon of Woe' },
  ]
  writeFiles(
    directory,
    vsDataReleaseFiles([record], 'MFM 1.6', entries, {
      es: [
        { kind: 'unit', id: 'necrons.tomb-blades', display: 'Cuchillas sepulcrales' },
        { kind: 'wargear', id: 'necrons.tomb-blades.particle-beamer', display: 'Haz de partículas' },
        { kind: 'detachment', id: 'necrons.pantheon-of-woe', display: 'Panteón de la Aflicción' },
      ],
      fr: [{ kind: 'unit', id: 'necrons.tomb-blades', display: 'Lames Tombales', aliases: [{ name: 'Lame-tombeaux' }] }],
    }),
  )
  expect(vsDataReleaseErrors(directory)).toEqual([])
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  const compact = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.rmSync(file)
  expect(compact.names).toEqual({
    factions: [],
    detachments: [['Pantheon of Woe', 'Panteón de la Aflicción']],
    enhancements: [],
    units: {
      'necrons.tomb-blades': {
        name: ['Tomb Blades', 'Cuchillas sepulcrales', 'Lames Tombales', 'Lame-tombeaux'],
        pieces: [['Particle Beamer', 'Haz de partículas']],
      },
    },
  })
})

it('keeps a unit the identity aliases to a BSData entry, with no roster record, as a unit with nothing to show', () => {
  fs.rmSync(directory, { recursive: true })
  const devotee = { kind: 'unit', id: 'adepta-sororitas.inspiring-devotee', name: 'Inspiring Devotee', aliases: ['bsdata.68a5.7e40'] }
  writeFiles(directory, vsDataReleaseFiles([record], 'MFM 1.6', [devotee]))
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  const compact = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.rmSync(file)
  expect([compact.entries['unit:adepta-sororitas.inspiring-devotee'], compact.units['adepta-sororitas.inspiring-devotee']]).toEqual([
    ['bsdata.68a5.7e40'],
    { sizes: [], models: [], options: [] },
  ])
})

it('keeps the choices a unit’s models start with where they differ, by the option they are of', () => {
  const roster = (kind: string, id: string, data: unknown, name = id) => ({ kind, id, name, aliases: [], category: 'rosters', data })
  const unit = 'adeptus-mechanicus.servitor-battleclade'
  const files = vsDataReleaseFiles([
    record,
    roster('unit', unit, {
      sizes: [9],
      defaults: { [`${unit}.gun-servitor-wargear`]: { [`${unit}.heavy-arc-rifle`]: 1, [`${unit}.heavy-bolter`]: 1 } },
    }),
    roster('roster-option', `${unit}.gun-servitor-wargear`, {
      unit,
      carrier: `${unit}.gun-servitor`,
      choose: { min: 1, max: 1 },
      choices: [`${unit}.heavy-bolter`, `${unit}.heavy-arc-rifle`],
    }),
    roster('model', `${unit}.gun-servitor`, { unit, min: 2, max: 2, wargear: {} }, 'Gun Servitor'),
    roster('wargear', `${unit}.heavy-bolter`, {}, 'Heavy bolter'),
    roster('wargear', `${unit}.heavy-arc-rifle`, {}, 'Heavy arc rifle'),
  ])
  fs.rmSync(directory, { recursive: true })
  writeFiles(directory, files)
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  const compact = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.rmSync(file)
  expect(compact.units[unit].options[0].defaults).toEqual([
    ['Heavy arc rifle', 1],
    ['Heavy bolter', 1],
  ])
})

it('keeps each invulnerable save a unit’s profiles print, a model’s own by its name, a condition by its summary', () => {
  const profile = (id: string, data: unknown, name = id) => ({ kind: 'unit-profile', id, name, aliases: [], category: 'profiles', data })
  const files = vsDataReleaseFiles([
    record,
    profile('drukhari.wyches', {
      unit: 'drukhari.wyches',
      invulnerableSave: { roll: 6, against: 'ranged', conditional: true, summary: 'Against melee attacks, this save is 4+.' },
    }),
    profile(
      'adepta-sororitas.repentia-squad.repentia-superior',
      { unit: 'adepta-sororitas.repentia-squad', invulnerableSave: { roll: 6 } },
      'Repentia Superior',
    ),
  ])
  fs.rmSync(directory, { recursive: true })
  writeFiles(directory, files)
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  const compact = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.rmSync(file)
  expect([
    compact.units['drukhari.wyches'].invulnerableSaves,
    compact.units['adepta-sororitas.repentia-squad'].invulnerableSaves,
    compact.records.find((kept: { kind: string }) => kept.kind === 'unit-profile')?.summary,
  ]).toEqual([
    [{ profile: 'drukhari.wyches', roll: 6, against: 'ranged', conditional: true, condition: 'drukhari.wyches' }],
    [{ profile: 'adepta-sororitas.repentia-squad.repentia-superior', model: 'Repentia Superior', roll: 6 }],
    'Against melee attacks, this save is 4+.',
  ])
})

it('keeps for each unit a shared record names the shared abilities it is one of', () => {
  fs.rmSync(directory, { recursive: true })
  const unit = (id: string) => ({ kind: 'unit', id, name: id, aliases: [`bsdata.${id.length}`] })
  const damaged = {
    kind: 'ability',
    id: 'shared.land-raider.damaged',
    name: 'Damaged',
    references: [
      { kind: 'unit', id: 'space-marines.land-raider' },
      { kind: 'core-rule', id: 'hit-rolls' },
    ],
  }
  writeFiles(directory, vsDataReleaseFiles([record], 'MFM 1.6', [unit('space-marines.land-raider'), unit('space-marines.rhino'), damaged]))
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  const compact = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.rmSync(file)
  expect([compact.units['space-marines.land-raider'].shared, compact.units['space-marines.rhino'].shared]).toEqual([
    ['shared.land-raider.damaged'],
    undefined,
  ])
})

it('keeps every save a profile holds, as one against ranged attacks and another against melee', () => {
  fs.rmSync(directory, { recursive: true })
  const profile = {
    kind: 'unit-profile',
    id: 'drukhari.wyches',
    name: 'Wyches',
    aliases: [],
    category: 'profiles',
    data: {
      unit: 'drukhari.wyches',
      invulnerableSave: [
        { roll: 6, against: 'ranged' },
        { roll: 4, against: 'melee' },
      ],
    },
  }
  writeFiles(directory, vsDataReleaseFiles([record, profile]))
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  const compact = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.rmSync(file)
  expect(compact.units['drukhari.wyches'].invulnerableSaves).toEqual([
    { profile: 'drukhari.wyches', roll: 6, against: 'ranged' },
    { profile: 'drukhari.wyches', roll: 4, against: 'melee' },
  ])
})

it('keeps each datasheet and ability profile the identity marks absent from the rules version, by BSData ids', () => {
  fs.rmSync(directory, { recursive: true })
  const ancient = { kind: 'unit', id: 'blood-angels.ancient', name: 'Ancient', aliases: ['bsdata.cd69.af58'] }
  const banner = {
    kind: 'ability',
    id: 'blood-angels.ancient.astartes-banner',
    name: 'Astartes Banner',
    aliases: ['bsdata.4873.a8a2'],
    absent: true as const,
    references: [{ kind: 'unit', id: 'blood-angels.ancient' }],
  }
  writeFiles(directory, vsDataReleaseFiles([record], 'MFM 1.4', [ancient, banner]))
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  const compact = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.rmSync(file)
  expect(compact.absentAbilities).toEqual([['cd69-af58', '4873-a8a2']])
})

it('keeps an absent ability with no BSData alias by its datasheet and name, as several absent rows sharing one have none', () => {
  fs.rmSync(directory, { recursive: true })
  const ancient = { kind: 'unit', id: 'blood-angels.ancient', name: 'Ancient', aliases: ['bsdata.cd69.af58'] }
  const banner = {
    kind: 'ability',
    id: 'blood-angels.ancient.astartes-banner',
    name: 'Astartes Banners',
    absent: true as const,
    references: [{ kind: 'unit', id: 'blood-angels.ancient' }],
  }
  writeFiles(directory, vsDataReleaseFiles([record], 'MFM 1.4', [ancient, banner]))
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  const compact = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.rmSync(file)
  expect(compact.absentAbilityNames).toEqual([['cd69-af58', 'astarte-banner']])
})

it('keeps each detachment rule the identity marks absent from the rules version, by detachment and abilityKey', () => {
  fs.rmSync(directory, { recursive: true })
  const wrath = {
    kind: 'ability',
    id: 'space-marines.ironstorm-spearhead.armoured-wrath',
    name: 'Armoured Wrath',
    absent: true as const,
    references: [{ kind: 'detachment', id: 'space-marines.ironstorm-spearhead' }],
  }
  writeFiles(directory, vsDataReleaseFiles([record], 'MFM 1.4', [wrath]))
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  const compact = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.rmSync(file)
  expect(compact.absentDetachmentRules).toEqual([['space-marines.ironstorm-spearhead', 'armoured-wrath']])
})

it('reads a complete record with no summary of its own, as a mission card is, as having none', () => {
  fs.rmSync(directory, { recursive: true })
  writeFiles(directory, vsDataReleaseFiles([record, { ...record, id: 'necrons.test.card', summary: undefined, data: { text: 'none' } }]))
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).records.map(({ id }: { id: string }) => id)).toEqual(['necrons.test.phase-shift'])
})

it('reads a record whose summary VS Data holds as unresolved as having none', () => {
  fs.rmSync(directory, { recursive: true })
  writeFiles(
    directory,
    vsDataReleaseFiles([
      record,
      { ...record, id: 'necrons.test.held', summary: undefined, data: { summary: { unresolved: 'Repeated the official wording.' } } },
    ]),
  )
  const file = `${directory}.json`
  compactVsDataRelease(directory, file)
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).records.map(({ id }: { id: string }) => id)).toEqual(['necrons.test.phase-shift'])
})
