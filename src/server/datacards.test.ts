import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  constructionCardKey,
  constructionDetachment,
  descriptionKey,
  enhancementEligibility,
  enhancementPoints,
  factionRestrictionCoverageIssues,
  factionRestrictions,
  loadDatacards,
  prose,
  restrictedBy,
} from './datacards'

it('requires the printed enhancement keywords on a datasheet', () => {
  const eligibility = (description: string, keywords: string[]) => enhancementEligibility({ description: { en: description }, keywords })
  expect(eligibility('<k>Adeptus Astartes Infantry</k> model only. Gain a save.', ['Infantry', 'Adeptus Astartes'])).toEqual({
    anyOf: [['Infantry', 'Adeptus Astartes']],
    excluded: [],
  })
  expect(eligibility('**Malignant Plaguecaster** only. Gain a save.', ['Malignant Plaguecaster'])).toEqual({
    anyOf: [['Malignant Plaguecaster']],
    excluded: [],
  })
  expect(
    enhancementEligibility({ description: { en: '**Malignant Plaguecaster** only. Gain a save.' }, keywords: ['Death Guard'] }, [
      'Malignant Plaguecaster',
    ]),
  ).toEqual({ anyOf: [['Malignant Plaguecaster']], excluded: [] })
  expect(eligibility('**SHIELD-CAPTAIN** or **BLADE CHAMPION** model only. Gain a save.', ['Shield-Captain', 'Blade Champion'])).toEqual({
    anyOf: [['Shield-Captain'], ['Blade Champion']],
    excluded: [],
  })
  expect(eligibility('WATCH MASTER/CAPTAIN model only. Gain a save.', ['Watch Master', 'Captain'])).toEqual({
    anyOf: [['Watch Master'], ['Captain']],
    excluded: [],
  })
  expect(
    enhancementEligibility({ description: { en: 'Big Mek/bigBoss/Warboss model only. Gain a save.' }, keywords: ['Big Mek', 'Warboss'] }, [
      'Bigboss',
    ]),
  ).toEqual({ anyOf: [['Big Mek'], ['Bigboss'], ['Warboss']], excluded: [] })
  expect(eligibility('Big Mek/bigBoss/Warboss model only. Gain a save.', ['Big Mek', 'Warboss'])).toBeNull()
  expect(
    enhancementEligibility(
      { description: { en: 'IRON-MASTER or MEMNYR STRATEGIST model only. Gain a save.' }, keywords: ['Brôkhyr', 'Memnyr Strategist'] },
      ['Brôkhyr Iron-master', 'Memnyr Strategist'],
    ),
  ).toEqual({ anyOf: [['Brôkhyr Iron-master'], ['Memnyr Strategist']], excluded: [] })
  expect(
    enhancementEligibility({ description: { en: 'IRON-MASTER model only. Gain a save.' }, keywords: ['Brôkhyr'] }, [
      'Brôkhyr Iron-master',
      'Other Iron-master',
    ]),
  ).toBeNull()
  expect(eligibility('Big Mek/Warboss Infantry model only. Gain a save.', ['Big Mek', 'Warboss', 'Infantry'])).toEqual({
    anyOf: [
      ['Big Mek', 'Infantry'],
      ['Warboss', 'Infantry'],
    ],
    excluded: [],
  })
  expect(eligibility('Adeptus Astartes Infantry/Mounted model only. Gain a save.', ['Adeptus Astartes', 'Infantry', 'Mounted'])).toEqual({
    anyOf: [
      ['Adeptus Astartes', 'Infantry'],
      ['Adeptus Astartes', 'Mounted'],
    ],
    excluded: [],
  })
  expect(
    eligibility('Infantry/Mounted Thousand Sons Psyker model only. Gain a save.', ['Infantry', 'Mounted', 'Thousand Sons', 'Psyker']),
  ).toEqual({
    anyOf: [
      ['Infantry', 'Thousand Sons', 'Psyker'],
      ['Mounted', 'Thousand Sons', 'Psyker'],
    ],
    excluded: [],
  })
  expect(eligibility('Chaplain/Judiciar model only. Gain a save.', ['Chaplain'])).toBeNull()
  expect(
    enhancementEligibility({ description: { en: 'Chaplain/Judiciar model only. Gain a save.' }, keywords: ['Chaplain'] }, ['Judiciar']),
  ).toEqual({ anyOf: [['Chaplain'], ['Judiciar']], excluded: [] })
  expect(
    enhancementEligibility({ description: { en: 'Chaos Lord with Jump Pack model only. Gain a save.' }, keywords: ['Heretic Astartes'] }, [
      'Chaos Lord with Jump Pack',
    ]),
  ).toEqual({ anyOf: [['Chaos Lord with Jump Pack']], excluded: [] })
  expect(
    enhancementEligibility(
      { description: { en: 'Winged Tyranid Prime/Tyranid Prime with lash whip model only. Gain a save.' }, keywords: ['Tyranids'] },
      ['Winged Tyranid Prime', 'Tyranid Prime with Lash Whip'],
    ),
  ).toEqual({ anyOf: [['Winged Tyranid Prime'], ['Tyranid Prime with Lash Whip']], excluded: [] })
  expect(eligibility('HERETIC ASTARTES model with the Deep Strike ability only. Gain a save.', ['Heretic Astartes'])).toEqual({
    anyOf: [['Heretic Astartes']],
    excluded: [],
    requiredAbilities: ['Deep Strike'],
  })
  expect(eligibility('<k>Deffkilla Wartrike</k> model only. Gain a save.', ['Orks'])).toBeNull()
  expect(
    enhancementEligibility({ description: { en: '<k>Deffkilla Wartrike</k> model only. Gain a save.' }, keywords: ['Orks'] }, [
      'Deffkilla Wartrike',
    ]),
  ).toEqual({ anyOf: [['Deffkilla Wartrike']], excluded: [] })
  expect(eligibility('**HERETIC ASTARTES** model (excluding **DAMNED** models) only. Gain a save.', ['Heretic Astartes'])).toEqual({
    anyOf: [['Heretic Astartes']],
    excluded: ['DAMNED'],
  })
  expect(eligibility('HERETIC ASTARTES model only (excluding DAMNED models). Gain a save.', ['Heretic Astartes'])).toEqual({
    anyOf: [['Heretic Astartes']],
    excluded: ['DAMNED'],
  })
  expect(eligibility('CHAOS LORD model only (excluding TERMINATOR and JUMP PACK models). Gain a save.', ['Chaos Lord'])).toEqual({
    anyOf: [['Chaos Lord']],
    excluded: ['TERMINATOR', 'JUMP PACK'],
  })
  expect(
    enhancementEligibility(
      { description: { en: 'CALLIDUS ASSASSIN models only. Gain a save.' }, keywords: ['DNU', 'Agents of the Imperium'] },
      ['Callidus Assassin'],
    ),
  ).toEqual({ anyOf: [['Callidus Assassin']], excluded: [] })
  expect(eligibility('CALLIDUS ASSASSIN models only. Gain a save.', ['DNU', 'Agents of the Imperium'])).toBeNull()
})

it('requires Character when the printed enhancement restriction says Character', () => {
  expect(
    enhancementEligibility({
      description: { en: 'ASTRA MILITARUM TITANIC CHARACTER TRANSPORT model only. Gain a save.' },
      keywords: ['Astra Militarum', 'Titanic', 'Transport'],
      equipableByNonCharacter: false,
    }),
  ).toEqual({ anyOf: [['Astra Militarum', 'Titanic', 'Transport', 'Character']], excluded: [] })
})

it('uses structured enhancement eligibility when the effect has no restriction sentence', () => {
  expect(
    enhancementEligibility({
      description: { en: 'Once per battle, this unit can enter strategic reserves.' },
      keywords: ['Necrons'],
      equipableByNonCharacter: false,
    }),
  ).toEqual({ anyOf: [['Necrons', 'Character']], excluded: [] })
  expect(
    enhancementEligibility({
      description: { en: 'LEAGUES OF VOTANN model equipped with an Autoch‑pattern combi‑bolter only. Gain a bonus.' },
      keywords: ['Leagues of Votann'],
      equipableByNonCharacter: false,
    }),
  ).toEqual({ anyOf: [['Leagues of Votann']], excluded: [], requiredWargear: ['Autoch‑pattern combi‑bolter'] })
})

it('folds accents and repeated construction suffixes into one join key', () => {
  expect(constructionCardKey('Tempête Shroud (Aura) (Upgrade)')).toBe(constructionCardKey('Tempete Shroud'))
})

let directory: string | null = null

it('loads authored faction attribution with its reference content', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'preview.json'),
    JSON.stringify({ name: 'Test', attribution: 'Community codex preview', datasheets: [], detachments: [] }),
  )

  expect(loadDatacards(directory).factions.get('test')?.attribution).toBe('Community codex preview')
})

it('loads named and parameterized weapon and core keyword definitions', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-keywords-'))
  fs.writeFileSync(
    path.join(directory, 'keywords.json'),
    JSON.stringify({
      keywords: [
        { name: 'Linked Fire', description: '<b>Link</b> attacks.', matchType: 'exact', appliesTo: ['weapons'] },
        { name: 'Melta', description: 'Add damage.', matchType: 'parameterized', appliesTo: ['weapons'] },
        { name: 'Stealth', description: 'Gain cover.', matchType: 'exact', appliesTo: ['abilities'] },
        { name: 'Feel No Pain', description: 'Ignore wounds.', matchType: 'parameterized', appliesTo: ['abilities'] },
        { name: 'Unrelated', description: 'Not an ability.', matchType: 'exact', appliesTo: ['other'] },
        { name: 'Unsupported', description: 'Unknown matching.', matchType: 'regex', appliesTo: ['weapons'] },
        { name: 'Empty', matchType: 'exact', appliesTo: ['weapons'] },
        { name: 'Conflicting', description: 'One.', matchType: 'exact', appliesTo: ['weapons'] },
        { name: 'Conflicting', description: 'Two.', matchType: 'exact', appliesTo: ['weapons'] },
      ],
    }),
  )
  expect(loadDatacards(directory).keywordRules).toEqual([
    { name: 'Linked Fire', description: '**Link** attacks.' },
    { name: 'Melta', description: 'Add damage.' },
    { name: 'Stealth', description: 'Gain cover.' },
    { name: 'Feel No Pain', description: 'Ignore wounds.' },
  ])
})

it('reads source instructions with their equipment names and skips incomplete groups', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'test.json'),
    JSON.stringify({
      name: 'Test',
      detachments: [],
      datasheets: [
        {
          id: 'troopers',
          name: { en: 'Troopers' },
          wargearOptions: [
            { instruction: { en: 'One trooper can replace their rifle.' }, options: [{ name: { en: 'Cannon' } }] },
            { instruction: { fr: 'Instruction' }, options: [{ name: { en: 'Blade' } }] },
            { instruction: { en: 'Missing equipment' }, options: [{ name: { fr: 'Arme' } }] },
          ],
        },
      ],
    }),
  )

  expect(loadDatacards(directory).factions.get('test')?.datasheetDetails.get('Troopers')?.wargearGroups).toEqual([
    { instruction: 'One trooper can replace their rifle.', options: ['Cannon'] },
  ])
})

it('reads a composition written as the source\u2019s own list, keeping the equipment sentence as the loadout', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'orks.json'),
    JSON.stringify({
      name: 'Orks',
      detachments: [],
      datasheets: [
        {
          id: 'beast-snagga-boyz',
          name: { en: 'Beast Snagga Boyz' },
          composition: [
            {
              en: '<ul><li>1-2 Nob models</li>\r<li>9\u201118 Beast Snagga Boy models</li></ul>\rEvery Nob is equipped with: 1 Power Snappa.',
            },
          ],
          loadout: { en: '' },
        },
      ],
    }),
  )

  const details = loadDatacards(directory).factions.get('orks')?.datasheetDetails.get('Beast Snagga Boyz')
  expect(details?.composition).toEqual(['1-2 Nob models', '9\u201118 Beast Snagga Boy models'])
  expect(details?.loadout).toBe('Every Nob is equipped with: 1 Power Snappa.')
})

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
    stratagems: new Map(),
    stratagemIssues: [],
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

it('names a section the card leaves empty, and takes its words from the catalogue', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'aeldari.json'),
    JSON.stringify({
      name: 'Aeldari',
      datasheets: [],
      detachments: [],
      rules: {
        army: [
          {
            name: { en: 'Battle Focus' },
            rules: [
              { order: 1, type: 'text', text: { en: 'Spend a token to perform an Agile Manoeuvre.' } },
              { order: 2, type: 'header', text: { en: 'Agile Manoeuvres' } },
              { order: 3, type: 'triggerEffectAccordion', title: { en: 'Swift as the Wind' } },
              { order: 4, type: 'triggerEffectAccordion', title: { en: 'Fade Back' } },
            ],
          },
        ],
      },
    }),
  )

  const asked: string[] = []
  const sections = ({ faction, entry, titles }: { faction: string; entry: string; titles: readonly string[] }) => {
    asked.push(`${faction} / ${entry}`)
    return new Map(titles.flatMap((title) => (title === 'Fade Back' ? [] : [[title, 'Add 2" to Move.']])))
  }
  const loaded = loadDatacards(directory, sections)

  // The card and the heading its empty titles sit under name the entry to ask for.
  expect(asked).toEqual(['Aeldari / Battle Focus - Agile Manoeuvres'])
  expect(loaded.factions.get('aeldari')?.armyRules).toEqual([
    {
      name: 'Battle Focus',
      description:
        'Spend a token to perform an Agile Manoeuvre.\n\n### Agile Manoeuvres\n\n### Swift as the Wind\n\nAdd 2" to Move.\n\n### Fade Back',
    },
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
    base: { points: 3, dispositions: ['disruption'] },
    validOverride: { points: 2, dispositions: ['disruption'] },
    malformedOverride: null,
    unrelatedDetachment: null,
    malformedDetachment: null,
    poisonedDetachment: null,
    unscopedOverride: null,
    baseWithConflictingOverride: { points: 3, dispositions: ['disruption'] },
    conflictingOverride: null,
    validEnhancement: 25,
    poisonedEnhancement: null,
    malformedEnhancement: null,
    conflictingDetachment: null,
    conflictingEnhancement: null,
    factionEnhancements: [
      { name: 'Fury of the Storm', detachment: 'Stormlance Task Force', points: null, description: null, eligibility: null },
      { name: 'Valid Relic', detachment: 'Stormlance Task Force', points: 25, description: null, eligibility: null },
      { name: 'Broken Relic', detachment: 'Stormlance Task Force', points: null, description: null, eligibility: null },
    ],
    factionScopedEnhancement: [
      { name: 'Shared Relic', detachment: 'Shared Detachment', points: 10, description: 'One relic.', eligibility: null },
    ],
    factionScopedRule: [{ name: 'Shared Rule', description: 'One rule.' }],
  })
})

it('reads both dispositions offered by a three-point detachment and rejects malformed alternatives', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'necrons.json'),
    JSON.stringify({
      name: 'Necrons',
      datasheets: [],
      detachments: [
        {
          name: { en: 'Awakened Dynasty' },
          detachmentPoints: 3,
          forceDisposition: { name: { en: 'Take and Hold' } },
          forceDispositions: [{ name: { en: 'Take and Hold' } }, { name: { en: 'Priority Assets' } }],
        },
        {
          name: { en: 'Plural Only' },
          detachmentPoints: 3,
          forceDispositions: [{ name: { en: 'Disruption' } }, { name: { en: 'Reconnaissance' } }],
        },
        {
          name: { en: 'Conflicting Choices' },
          detachmentPoints: 3,
          forceDisposition: { name: { en: 'Disruption' } },
          forceDispositions: [{ name: { en: 'Reconnaissance' } }, { name: { en: 'Disruption' } }],
        },
        {
          name: { en: 'Malformed Choices' },
          detachmentPoints: 3,
          forceDisposition: { name: { en: 'Disruption' } },
          forceDispositions: [{ name: { en: 'Disruption' } }, { name: { fr: 'Unavailable' } }],
        },
      ],
    }),
  )

  const data = loadDatacards(directory)
  const construction = (name: string) => constructionDetachment(data, 'Necrons', name)
  expect({
    offered: construction('Awakened Dynasty'),
    pluralOnly: construction('Plural Only'),
    conflicting: construction('Conflicting Choices'),
    malformed: construction('Malformed Choices'),
  }).toEqual({
    offered: { points: 3, dispositions: ['take-and-hold', 'priority-assets'] },
    pluralOnly: { points: 3, dispositions: ['disruption', 'reconnaissance'] },
    conflicting: null,
    malformed: null,
  })
})

it('reads faction stratagem mechanics and leaves malformed cards unavailable', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'orks.json'),
    JSON.stringify({
      name: 'Orks',
      datasheets: [],
      detachments: [{ name: { en: 'War Horde' } }],
      stratagems: [
        {
          id: 'hit-em-harder',
          name: { en: 'Hit ’Em Harder' },
          detachment: 'War Horde',
          cost: 1,
          phase: ['any'],
          turn: 'your',
          type: 'Battle Tactic',
          effect: { en: 'Your attacks have Lethal Hits.' },
        },
        {
          id: 'unknown-phase',
          name: { en: 'Unknown Phase' },
          detachment: 'War Horde',
          cost: 1,
          phase: ['deployment'],
          turn: 'either',
          effect: { en: 'Do something.' },
        },
        {
          id: 'printed-phase',
          name: { en: 'Order the Advance' },
          detachment: 'War Horde',
          cost: 1,
          phase: [],
          turn: 'your',
          when: { en: 'Start of your Movement phase.' },
          effect: { en: 'Advance.' },
        },
      ],
    }),
  )

  expect(loadDatacards(directory).factions.get('orks')?.stratagems.get('warhorde')).toEqual([
    {
      id: 'hit-em-harder',
      name: 'Hit ’Em Harder',
      cp: 1,
      limit: 'phase',
      phases: [],
      turn: 'your-turn',
      type: 'Battle Tactic',
      description: '**Effect:** Your attacks have Lethal Hits.',
    },
    {
      id: 'printed-phase',
      name: 'Order the Advance',
      cp: 1,
      limit: 'phase',
      phases: ['movement'],
      turn: 'your-turn',
      type: null,
      description: '**When:** Start of your Movement phase.\n\n**Effect:** Advance.',
    },
  ])
  expect(loadDatacards(directory).factions.get('orks')?.stratagemIssues).toEqual(['War Horde | Unknown Phase: incomplete card'])
})

it('leaves conflicting stratagem ids unavailable', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'orks.json'),
    JSON.stringify({
      name: 'Orks',
      datasheets: [],
      detachments: [{ name: { en: 'War Horde' } }],
      stratagems: ['Charge', 'Retreat'].map((name) => ({
        id: 'shared-id',
        name: { en: name },
        detachment: 'War Horde',
        cost: 1,
        phase: ['fight'],
        turn: 'either',
        effect: { en: 'Move.' },
      })),
    }),
  )

  expect(loadDatacards(directory).factions.get('orks')?.stratagems.get('warhorde')).toEqual([])
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
          fluff: { en: 'Ceramite plates turn aside the enemy barrage.' },
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

it('resolves a named enhancement target in another faction file', () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacards-'))
  fs.writeFileSync(
    path.join(directory, 'black-templars.json'),
    JSON.stringify({
      name: 'Black Templars',
      datasheets: [],
      detachments: [],
      enhancements: [
        {
          name: { en: 'Incendiary Animus' },
          detachment: 'Vow-sworn Crusaders',
          description: { en: 'Chaplain/Judiciar model only. Gain a save.' },
          keywords: ['Chaplain'],
        },
      ],
    }),
  )
  fs.writeFileSync(
    path.join(directory, 'space-marines.json'),
    JSON.stringify({ name: 'Adeptus Astartes', datasheets: [{ name: { en: 'Judiciar' } }], detachments: [] }),
  )

  const enhancements = loadDatacards(directory).factions.get('black-templars')?.enhancements
  expect([...enhancements!.values()][0]?.[0]?.eligibility).toEqual({ anyOf: [['Chaplain'], ['Judiciar']], excluded: [] })
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

  it('reads an exclusion list with a named faction and separate bullet lines', () => {
    const datacards = factions({
      'dw.json': {
        name: 'Deathwatch',
        text: 'Your army cannot include the following <k>Adeptus Astartes</k> units:<ul><li><k>Scout Squad</k> units.</li><li><k>Terminator Squad</k> units.</li></ul>',
      },
    })
    expect({
      excluded: [...(factionRestrictions(datacards).get('deathwatch')?.excludedNames ?? [])],
      uncaptured: factionRestrictionCoverageIssues(datacards),
    }).toEqual({
      excluded: [
        ['scout squad', null],
        ['terminator squad', null],
      ],
      uncaptured: [],
    })
  })

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

it('hands a card\u2019s table on as the source wrote it', () => {
  expect(prose('Roll one D6:\r<table>\r<tr><td>1‑2</td>\r<td>+1<b> A</b></td></tr></table>\rThen <b>fight</b>.')).toBe(
    'Roll one D6:\n<table>\r<tr><td>1‑2</td>\r<td>+1<b> A</b></td></tr></table>\nThen **fight**.',
  )
})
