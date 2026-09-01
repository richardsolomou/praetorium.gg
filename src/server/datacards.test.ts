import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  constructionCardKey,
  constructionDetachment,
  descriptionKey,
  enhancementPoints,
  factionRestrictionCoverageIssues,
  factionRestrictions,
  loadDatacards,
  prose,
  restrictedBy,
} from './datacards'

it('folds accents and repeated construction suffixes into one join key', () => {
  expect(constructionCardKey('Tempête Shroud (Aura) (Upgrade)')).toBe(constructionCardKey('Tempete Shroud'))
})

let directory: string | null = null

afterEach(() => {
  if (directory) fs.rmSync(directory, { recursive: true, force: true })
  directory = null
})

it('indexes the faction-owned datasheets and detachments', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'darkangels.json'),
    JSON.stringify({
      id: 'dark-angels',
      name: 'Dark Angels',
      datasheets: [
        {
          id: 'asmodai',
          name: { en: 'Asmodai' },
          composition: [{ en: '**1 Asmodai**' }],
          loadout: { en: '**This model is equipped with:** Crozius arcanum.' },
          wargear: [{ en: 'This model cannot replace its wargear.' }],
          baseSize: { en: '50mm' },
          transport: { en: 'This model has a transport capacity of 6 **INFANTRY** models.' },
          points: [{ models: '1', cost: '70', keyword: null, faction: null, detachment: null }],
          attachesTo: [{ type: 'leader', target: 'Azrael', targetType: 'datasheet' }],
        },
        { id: 'azrael', name: { en: 'Azrael' } },
      ],
      detachments: [{ name: { en: 'Inner Circle Task Force' } }, { name: { en: 'Unforgiven Task Force' } }],
    }),
  )

  expect(loadDatacards(directory).factions.get('dark-angels')).toEqual({
    name: 'Dark Angels',
    datasheets: new Set(['Asmodai', 'Azrael']),
    datasheetDetails: new Map([
      [
        'Asmodai',
        {
          composition: ['**1 Asmodai**'],
          loadout: '**This model is equipped with:** Crozius arcanum.',
          wargear: ['This model cannot replace its wargear.'],
          baseSize: '50mm',
          transport: 'This model has a transport capacity of 6 **INFANTRY** models.',
          points: [{ models: '1', cost: '70', keyword: null, faction: null, detachment: null }],
          attachesTo: [{ kind: 'leader', name: 'Azrael' }],
          leaders: [],
          supporters: [],
        },
      ],
      [
        'Azrael',
        {
          composition: [],
          loadout: null,
          wargear: [],
          baseSize: null,
          transport: null,
          points: [],
          attachesTo: [],
          leaders: ['Asmodai'],
          supporters: [],
        },
      ],
    ]),
    datasheetIds: new Map([
      [
        'asmodai',
        {
          composition: ['**1 Asmodai**'],
          loadout: '**This model is equipped with:** Crozius arcanum.',
          wargear: ['This model cannot replace its wargear.'],
          baseSize: '50mm',
          transport: 'This model has a transport capacity of 6 **INFANTRY** models.',
          points: [{ models: '1', cost: '70', keyword: null, faction: null, detachment: null }],
          attachesTo: [{ kind: 'leader', name: 'Azrael' }],
          leaders: [],
          supporters: [],
        },
      ],
      [
        'azrael',
        {
          composition: [],
          loadout: null,
          wargear: [],
          baseSize: null,
          transport: null,
          points: [],
          attachesTo: [],
          leaders: ['Asmodai'],
          supporters: [],
        },
      ],
    ]),
    detachments: new Set(['Inner Circle Task Force', 'Unforgiven Task Force']),
    enhancements: new Map(),
    detachmentRules: new Map(),
    factionAbilityNames: new Set(),
    armyRules: [],
  })
})

it('reads every structured army rule', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'custodes.json'),
    JSON.stringify({
      name: 'Adeptus Custodes',
      datasheets: [],
      detachments: [],
      rules: {
        army: [
          {
            name: { en: 'Martial Ka’tah' },
            rules: [
              { order: 2, type: 'header', text: { en: 'Rendax Stance' } },
              { order: 1, type: 'text', text: { en: 'Select a stance.' } },
              { order: 3, type: 'text', text: { en: 'Weapons gain **[LETHAL HITS]**.' } },
            ],
          },
        ],
      },
    }),
  )

  expect(loadDatacards(directory).factions.get('adeptus-custodes')?.armyRules).toEqual([
    { name: 'Martial Ka’tah', description: 'Select a stance.\n\n### Rendax Stance\n\nWeapons gain **[LETHAL HITS]**.' },
  ])
})

it('reads army-construction numbers without trusting malformed alternatives', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'space-marines.json'),
    JSON.stringify({
      name: 'Adeptus Astartes',
      datasheets: [],
      detachments: [
        {
          name: { en: 'Stormlance Task Force' },
          detachmentPoints: 3,
          detachmentPointsOverrides: [
            { faction: 'Black Templars', detachmentPoints: 'many' },
            { faction: 'White Scars', detachmentPoints: 2 },
          ],
          forceDisposition: { name: { en: 'Disruption' } },
        },
        {
          name: { en: 'Broken Task Force' },
          detachmentPoints: 'many',
          forceDisposition: { name: { en: 'Reconnaissance' } },
        },
        {
          name: { en: 'Conflicting Override' },
          detachmentPoints: 3,
          detachmentPointsOverrides: [
            { faction: 'Black Templars', detachmentPoints: 2 },
            { faction: 'Black Templars', detachmentPoints: 1 },
          ],
          forceDisposition: { name: { en: 'Disruption' } },
        },
        {
          name: { en: 'Poisoned Task Force' },
          detachmentPoints: 3,
          forceDisposition: { name: { en: 'Disruption' } },
        },
        {
          name: { en: 'Poisoned Task Force' },
          detachmentPoints: 'many',
          forceDisposition: { name: { en: 'Disruption' } },
        },
        {
          name: { en: 'Unscoped Override' },
          detachmentPoints: 3,
          detachmentPointsOverrides: [{ detachmentPoints: 2 }],
          forceDisposition: { name: { en: 'Disruption' } },
        },
      ],
      enhancements: [
        { name: { en: 'Fury of the Storm' }, detachment: 'Stormlance Task Force', cost: '25' },
        { name: { en: 'Fury of the Storm' }, detachment: 'Stormlance Task Force', cost: 'cheap' },
        { name: { en: 'Valid Relic' }, detachment: 'Stormlance Task Force', cost: '25' },
        { name: { en: 'Broken Relic' }, detachment: 'Stormlance Task Force', cost: 'cheap' },
      ],
    }),
  )
  for (const [file, faction, points, cost] of [
    ['one.json', 'One', 1, '10'],
    ['two.json', 'Two', 2, '20'],
  ] as const) {
    fs.writeFileSync(
      path.join(directory, file),
      JSON.stringify({
        name: faction,
        datasheets: [],
        detachments: [{ name: { en: 'Shared Detachment' }, detachmentPoints: points, forceDisposition: { name: { en: 'Disruption' } } }],
        enhancements: [{ name: { en: 'Shared Relic' }, detachment: 'Shared Detachment', cost, description: { en: `${faction} relic.` } }],
        rules: {
          detachment: [
            {
              detachment: 'Shared Detachment',
              rules: [{ name: { en: 'Shared Rule' }, rules: [{ order: 1, type: 'text', text: { en: `${faction} rule.` } }] }],
            },
          ],
        },
      }),
    )
  }

  const datacards = loadDatacards(directory)
  expect({
    base: constructionDetachment(datacards, 'Adeptus Astartes', 'Stormlance Task Force'),
    validOverride: constructionDetachment(datacards, 'White Scars', 'Stormlance Task Force', 'adeptus-astartes'),
    malformedOverride: constructionDetachment(datacards, 'Black Templars', 'Stormlance Task Force', 'adeptus-astartes'),
    unrelatedDetachment: constructionDetachment(datacards, 'Orks', 'Stormlance Task Force'),
    malformedDetachment: constructionDetachment(datacards, 'Adeptus Astartes', 'Broken Task Force'),
    poisonedDetachment: constructionDetachment(datacards, 'Adeptus Astartes', 'Poisoned Task Force'),
    unscopedOverride: constructionDetachment(datacards, 'Adeptus Astartes', 'Unscoped Override'),
    baseWithConflictingOverride: constructionDetachment(datacards, 'Adeptus Astartes', 'Conflicting Override'),
    conflictingOverride: constructionDetachment(datacards, 'Black Templars', 'Conflicting Override'),
    validEnhancement: enhancementPoints(datacards, 'Stormlance Task Force', 'Valid Relic'),
    poisonedEnhancement: enhancementPoints(datacards, 'Stormlance Task Force', 'Fury of the Storm'),
    malformedEnhancement: enhancementPoints(datacards, 'Stormlance Task Force', 'Broken Relic'),
    conflictingDetachment: constructionDetachment(datacards, 'Unknown Faction', 'Shared Detachment'),
    conflictingEnhancement: enhancementPoints(datacards, 'Shared Detachment', 'Shared Relic'),
    factionEnhancements: datacards.factions.get('adeptus-astartes')?.enhancements.get('stormlancetaskforce'),
    factionScopedEnhancement: datacards.factions.get('one')?.enhancements.get('shareddetachment'),
    factionScopedRule: datacards.factions.get('one')?.detachmentRules.get('shareddetachment'),
  }).toEqual({
    base: { points: 3, disposition: 'disruption' },
    validOverride: { points: 2, disposition: 'disruption' },
    malformedOverride: null,
    unrelatedDetachment: null,
    malformedDetachment: null,
    poisonedDetachment: null,
    unscopedOverride: null,
    baseWithConflictingOverride: { points: 3, disposition: 'disruption' },
    conflictingOverride: null,
    validEnhancement: 25,
    poisonedEnhancement: null,
    malformedEnhancement: null,
    conflictingDetachment: null,
    conflictingEnhancement: null,
    factionEnhancements: [
      { name: 'Fury of the Storm', detachment: 'Stormlance Task Force', points: null, description: null },
      { name: 'Valid Relic', detachment: 'Stormlance Task Force', points: 25, description: null },
      { name: 'Broken Relic', detachment: 'Stormlance Task Force', points: null, description: null },
    ],
    factionScopedEnhancement: [{ name: 'Shared Relic', detachment: 'Shared Detachment', points: 10, description: 'One relic.' }],
    factionScopedRule: [{ name: 'Shared Rule', description: 'One rule.' }],
  })
})

it('adds dimensions to named flying bases', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'aeldari.json'),
    JSON.stringify({
      name: 'Aeldari',
      datasheets: [
        { name: { en: 'Falcon' }, baseSize: { en: 'Large Flying Base' } },
        { name: { en: 'Farseer Skyrunner' }, baseSize: { en: 'Small Flying Base' } },
        { name: { en: 'Crimson Hunter' }, baseSize: { en: 'Aircraft Flying Base' } },
      ],
      detachments: [],
    }),
  )

  const details = loadDatacards(directory).factions.get('aeldari')?.datasheetDetails
  expect([details?.get('Falcon')?.baseSize, details?.get('Farseer Skyrunner')?.baseSize, details?.get('Crimson Hunter')?.baseSize]).toEqual(
    ['Large Flying Base (Ø60mm)', 'Small Flying Base (Ø32mm)', 'Aircraft Flying Base (120 × 92 mm oval)'],
  )
})

it('reads card markup as the markdown the app renders', () => {
  expect(prose('Friendly <k>Tech-Priest</k> models have: \r<ul><li>4+ <b>InSv</b>.</li>\r<li><u>Feel No Pain 5+</u>.</li></ul>')).toBe(
    'Friendly **Tech-Priest** models have:\n\n- 4+ **InSv**.\n- Feel No Pain 5+.',
  )
})

it('keys a card by its detachment and name, whatever suffix a source prints', () => {
  expect(descriptionKey('The Phaeron’s Armoury', 'Mortality Shroud (Aura) (Upgrade)')).toBe(
    descriptionKey("The Phaeron's Armoury", 'Mortality Shroud'),
  )
})

it('answers for a faction under the name the catalogues give it', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'space_marines.json'),
    JSON.stringify({
      name: 'Adeptus Astartes',
      datasheets: [],
      detachments: [{ name: { en: 'Gladius Task Force' } }],
      rules: {
        army: [{ name: { en: 'Oath of Moment' }, rules: [{ order: 1, type: 'text', text: { en: 'Re-roll the Hit roll.' } }] }],
        detachment: [
          {
            detachment: 'Gladius Task Force',
            rules: [{ name: { en: 'Combat Doctrines' }, rules: [{ order: 1, type: 'text', text: { en: 'Pick a doctrine.' } }] }],
          },
        ],
      },
      enhancements: [
        { name: { en: 'Artificer Armour' }, detachment: 'Gladius Task Force', description: { en: 'The bearer has a 2+ Save.' } },
      ],
      stratagems: [
        {
          name: { en: 'Armour of Contempt' },
          detachment: 'Gladius Task Force',
          when: { en: 'Your opponent’s Shooting phase.' },
          effect: { en: 'Worsen the AP by 1.' },
        },
      ],
    }),
  )
  const datacards = loadDatacards(directory)
  expect({
    aliased: datacards.factions.get('space-marines') === datacards.factions.get('adeptus-astartes'),
    armyRule: datacards.armyRules.get('oath-of-moment'),
    detachmentRule: datacards.detachmentRules.get('gladius-task-force'),
    enhancement: datacards.enhancements.get(descriptionKey('Gladius Task Force', 'Artificer Armour')),
    stratagem: datacards.stratagems.get(descriptionKey('Gladius Task Force', 'ARMOUR OF CONTEMPT')),
  }).toEqual({
    aliased: true,
    armyRule: 'Re-roll the Hit roll.',
    detachmentRule: [{ name: 'Combat Doctrines', description: 'Pick a doctrine.' }],
    enhancement: 'The bearer has a 2+ Save.',
    stratagem: { name: 'Armour of Contempt', description: '**When:** Your opponent’s Shooting phase.\n\n**Effect:** Worsen the AP by 1.' },
  })
})

it('leaves a card the files describe two ways blank', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  for (const [file, text] of [
    ['a.json', 'First.'],
    ['b.json', 'Second.'],
  ] as const) {
    fs.writeFileSync(
      path.join(directory, file),
      JSON.stringify({
        name: file,
        datasheets: [],
        detachments: [],
        enhancements: [{ name: { en: 'Shared Relic' }, detachment: 'Shared Detachment', description: { en: text } }],
      }),
    )
  }
  expect(loadDatacards(directory).enhancements.has(descriptionKey('Shared Detachment', 'Shared Relic'))).toBe(false)
})

describe('army-construction restrictions', () => {
  const armyRule = (text: string) => ({ name: { en: 'Space Marine Chapters' }, rules: [{ order: 1, type: 'text', text: { en: text } }] })
  const factions = (files: Record<string, { name: string; text: string }>) => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
    for (const [file, { name, text }] of Object.entries(files)) {
      fs.writeFileSync(
        path.join(directory, file),
        JSON.stringify({ name, datasheets: [], detachments: [], rules: { army: [armyRule(text)] } }),
      )
    }
    return loadDatacards(directory)
  }

  it('assigns a combined chapter rule to each faction it names', () => {
    const restrictions = factionRestrictions(
      factions({
        'sm.json': {
          name: 'Adeptus Astartes',
          text: [
            '■ If your army includes one or more **BLACK TEMPLARS** units, it cannot include any **ADEPTUS ASTARTES PSYKER** models, and cannot include any of the following models that do not have the Black Templars keyword: **GLADIATOR LANCER**; **REPULSOR**.',
            '■ If your army includes one or more **SPACE WOLVES** units, it cannot include any of the following units: **APOTHECARY**.',
            '**DEATHWATCH**',
            '■ Your army cannot include any of the following units: **SCOUT SQUAD**; **TACTICAL SQUAD**.',
          ].join('\n\n'),
        },
      }),
    )
    expect(Object.fromEntries([...restrictions].map(([faction, rule]) => [faction, [...rule.excludedNames]]))).toEqual({
      'black-templars': [
        ['gladiator lancer', 'black templars'],
        ['repulsor', 'black templars'],
      ],
      'space-wolves': [['apothecary', null]],
      deathwatch: [
        ['scout squad', null],
        ['tactical squad', null],
      ],
    })
    expect(restrictions.get('black-templars')?.excludedKeywords).toEqual(new Set(['psyker']))
  })

  it("exempts a faction's own datasheets from a ban on another codex's", () => {
    const restrictions = factionRestrictions(
      factions({
        'bt.json': {
          name: 'Black Templars',
          text: '□ Your army cannot include the following datasheets from *Codex: Space Marines:* Impulsor; Terminator Squad.',
        },
      }),
    )
    expect([...(restrictions.get('black-templars')?.excludedNames ?? [])]).toEqual([
      ['impulsor', 'black templars'],
      ['terminator squad', 'black templars'],
    ])
  })

  it('names every exclusion list that no typed restriction captured', () => {
    const datacards = factions({
      'dw.json': { name: 'Deathwatch', text: 'Your army cannot include any of the following units: Scouts.' },
      'sw.json': {
        name: 'Space Wolves',
        text: 'If your army includes one or more SPACE WOLVES units, it cannot include these following units: Wolf Scouts.',
      },
    })
    expect(factionRestrictionCoverageIssues(datacards)).toEqual(['Space Wolves: wolf scouts'])
  })

  it('refuses a unit by name unless it carries the exempting keyword', () => {
    const restrictions = { excludedNames: new Map([['impulsor', 'black templars']]), excludedKeywords: new Set(['psyker']) }
    expect([
      restrictedBy(restrictions, 'Impulsor', ['Vehicle']),
      restrictedBy(restrictions, 'Impulsor', ['Vehicle', 'Faction: Black Templars']),
      restrictedBy(restrictions, 'Librarian', ['Character', 'Psyker']),
      restrictedBy(restrictions, 'Marshal', ['Character']),
    ]).toEqual([{ keyword: null }, null, { keyword: 'Psyker' }, null])
  })
})
