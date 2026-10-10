import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { hasDetachmentSemantics, loadRules, missionFor } from './rules'
import { missionCardsFromDatacards } from './datacardMissions'
import { stratagemLimit } from './datacards'
import { bookOf } from './catalogue.fixtures'
import { factionsFor } from './factionReferences'

let directory: string
const write = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}
const pack = () => path.join(directory, 'datacards', '11th', 'gdc', 'missions', 'chapter.json')
const rules = () => loadRules(directory)!

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacard-rules-'))
  const datacards = path.join(directory, 'datacards', '11th', 'gdc')
  write(path.join(datacards, 'deathguard.json'), {
    name: 'Death Guard',
    datasheets: [],
    detachments: [{ name: { en: 'Flyblown Host' }, detachmentPoints: 2, forceDisposition: { name: { en: 'Disruption' } } }],
    enhancements: [
      { id: 'relic', name: { en: 'Living Plague' }, detachment: 'Flyblown Host', cost: 20, description: { en: 'Spread disease.' } },
    ],
    stratagems: [
      {
        id: 'reapers',
        name: { en: 'Grim Reapers' },
        detachment: 'Flyblown Host',
        cost: 1,
        phase: ['fight'],
        turn: 'either',
        effect: { en: 'Cut them down.' },
      },
    ],
  })
  write(path.join(datacards, 'core.json'), {
    stratagems: [{ id: 'reroll', name: { en: 'Command Re-roll' }, cost: 1, phase: ['any'], turn: 'either', effect: { en: 'Re-roll.' } }],
  })
  write(pack(), {
    name: { en: 'Chapter Approved' },
    forceDispositions: [{ name: { en: 'Disruption' } }, { name: { en: 'Take and Hold' } }],
    primaryMissionScoreBattleRoundLimit: 15,
    primaryMissionScoreGameLimit: 45,
    secondaryMissionScoreBattleRoundLimit: 15,
    secondaryMissionScoreGameLimit: 45,
    fixedSecondaryMissionCapLimit: 20,
    deployments: [{ id: 'deploy-1', name: { en: 'Tipping Point' } }],
    layouts: [{ id: 'layout-1', name: { en: 'Disruption / Take and Hold - Layout A' }, deployments: ['Tipping Point'] }],
    presets: [
      { name: { en: 'Disruption/Take and Hold - Layout A' }, layout: 'Disruption / Take and Hold - Layout A', deployment: 'Tipping Point' },
    ],
    primaryMissions: [
      {
        id: 'primary-1',
        name: { en: 'Death Trap' },
        forceDispositions: [
          { friendly: 'Disruption', opposition: 'Take and Hold', recommendedPresets: ['Disruption/Take and Hold - Layout A'] },
        ],
        objectives: [
          {
            whenText: { en: 'End of your turn.' },
            scorablePeriods: ['secondBattleRound', 'thirdBattleRound'],
            scoring: [{ victoryPoints: 5, inputType: 'stepper', scoringCriteria: { en: 'For each objective you control.' } }],
          },
        ],
      },
    ],
    secondaryMissions: [
      {
        id: 'secondary-1',
        name: { en: 'No Prisoners' },
        objectives: [
          {
            whenText: { en: 'End of a turn.' },
            scoring: [{ victoryPoints: 4, scoringType: 'tactical', scoringCriteria: { en: 'Destroy an enemy unit.' } }],
          },
        ],
      },
    ],
  })
})

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

it('loads Game Datacards rules without a 40kdc directory', () => {
  expect(rules()).toMatchObject({
    core: [{ key: 'reroll', name: 'Command Re-roll' }],
    primaries: [{ key: 'primary-1', name: 'Death Trap' }],
    secondaries: [{ key: 'secondary-1', name: 'No Prisoners' }],
  })
})

it('loads pinned faction icons and maps the Astartes icon to Space Marines', () => {
  const icons = path.join(directory, 'icons')
  fs.mkdirSync(icons)
  fs.writeFileSync(path.join(icons, 'death-guard.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  fs.writeFileSync(path.join(icons, 'adeptus-astartes.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>')
  const loaded = rules()
  expect(loaded.factionIcons.get('death-guard')).toContain('data:image/svg+xml;base64,')
  expect(loaded.factionIcons.get('space-marines')).toBe(loaded.factionIcons.get('adeptus-astartes'))
})

it('loads faction icons from a legacy snapshot', () => {
  const icons = path.join(directory, 'faction-icons')
  fs.mkdirSync(icons)
  fs.writeFileSync(path.join(icons, 'necrons.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  expect(rules().factionIcons.get('necrons')).toContain('data:image/svg+xml;base64,')
})

it('loads the publisher-backed Colosseum battlefield when its source is present', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'kotc.json'), {
    format: 'praetorium.kotc.v1',
    id: 'king-of-the-colosseum-2',
    name: 'King of the Colosseum 2.0',
    publisher: 'https://playontabletop.com/kotc/',
    boardIn: 36,
    deploymentDepthIn: 8,
    objectiveDiagram: 'https://playontabletop.com/wp-content/uploads/2026/09/frontline-objectives.png',
    terrainDiagram: 'https://playontabletop.com/wp-content/uploads/2026/09/frontline-terrain.png',
    wallThicknessIn: 0.5,
    arena: { radiusIn: 13, wallHalfAngleDeg: 31.4 },
    objectiveRadiusIn: 3.79,
    pieces: [
      {
        name: 'Corner ruin',
        mirrors: ['none'],
        parts: [
          {
            name: 'Ruin wall',
            material: 'dense',
            walls: [
              [
                { x: 0.25, y: 5.15 },
                { x: 5.75, y: 5.15 },
              ],
            ],
          },
        ],
      },
    ],
  })
  const loaded = rules()
  const layout = loaded.terrainLayouts.find((entry) => entry.id === 'king-of-the-colosseum-2')
  expect(layout).toMatchObject({
    matchupId: 'king-of-the-colosseum',
    deploymentId: 'deployment-king-of-the-colosseum-2',
    geometry: { board: { width: 36, height: 36 } },
  })
  expect(layout?.geometry?.areas.filter((area) => area.objective)).toHaveLength(5)
  expect(loaded.deployments.find((entry) => entry.id === layout?.deploymentId)?.zones).toHaveLength(2)
  expect(loaded.attribution).toContain('Play On Tabletop')
})

it('uses the current detachment points and stratagem card', () => {
  expect(rules().detachmentDetails.get('death-guard')?.get('flyblown-host')).toMatchObject({
    points: 2,
    dispositions: ['disruption'],
    stratagems: [{ id: 'reapers', cp: 1, phases: ['fight'] }],
    enhancements: [{ name: 'Living Plague', points: 20, eligibility: null }],
  })
})

it('enforces the core once per phase limit for faction and core stratagems', () => {
  expect(rules().byDetachment.get('death-guard')?.get('flyblown-host')?.[0]?.limit).toBe('phase')
  expect(rules().core[0]?.limit).toBe('phase')
})

it('corrects Insane Bravery timing from the pinned printed core rule', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'core.json'), {
    stratagems: [
      {
        id: '55e8e302-c2a2-57fb-852d-a88fbb95f6c2',
        name: { en: 'Insane Bravery' },
        cost: 1,
        phase: ['charge'],
        turn: 'your',
        restrictions: { en: 'You cannot use this stratagem more than once per battle.' },
      },
    ],
  })
  expect(rules().core).toEqual([
    { key: '55e8e302-c2a2-57fb-852d-a88fbb95f6c2', name: 'Insane Bravery', cp: 1, limit: 'battle', phases: ['command'], turn: 'your-turn' },
  ])
})

it('uses an explicit whole-stratagem exception without treating a target limit as one', () => {
  expect([
    stratagemLimit('You cannot use this <b>stratagem</b> more than once per battle.'),
    stratagemLimit('You can only use this Stratagem once per turn.'),
    stratagemLimit('You cannot target the same unit with this Stratagem more than once per battle.'),
    stratagemLimit('You cannot use this Stratagem on the same model more than once per battle.'),
    stratagemLimit('You can only use this Stratagem once per battle round.'),
  ]).toEqual(['battle', 'turn', 'phase', 'phase', 'battle-round'])
})

it('recognizes a detachment whose slug contains an accented name', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'votann.json'), {
    name: 'Leagues of Votann',
    datasheets: [],
    detachments: [{ name: { en: 'Dêlve Assault Shift' }, detachmentPoints: 2, forceDisposition: { name: { en: 'Disruption' } } }],
    stratagems: [
      {
        id: 'delve',
        name: { en: 'Drill' },
        detachment: 'Dêlve Assault Shift',
        cost: 1,
        phase: ['fight'],
        turn: 'either',
        effect: { en: 'Drill.' },
      },
    ],
  })
  expect(hasDetachmentSemantics(rules(), { faction: 'Leagues of Votann', name: 'Dêlve Assault Shift' })).toBe(true)
})

it('does not substitute an unrelated army rule for a missing faction ability', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'orks.json'), {
    name: 'Orks',
    datasheets: [{ abilities: { faction: [{ name: { en: 'Waaagh!' } }] } }],
    detachments: [],
    rules: { army: [{ name: { en: 'Da Boss' }, rules: [{ type: 'text', text: { en: 'Gain a command point.' } }] }] },
  })
  expect(rules().factionRules.has('orks')).toBe(false)
})

it('fills a missing army ability from the same faction catalogue by exact name', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'orks.json'), {
    name: 'Orks',
    datasheets: [{ abilities: { faction: [{ name: { en: 'Waaagh!' } }] } }],
    detachments: [],
  })
  write(path.join(directory, 'definitions', 'Orks.json'), {
    catalogue: {
      name: 'Xenos - Orks',
      rules: [
        { id: 'waaagh', name: 'Waaagh!', description: 'Orks become riled up.' },
        { id: 'war-cry', name: 'War Cry', description: 'Friendly Orks with the **Waaagh!** ability become riled up.' },
      ],
    },
  })
  expect(rules().supplementalArmyRules.get('orks')).toEqual([
    { name: 'Waaagh!', description: 'Orks become riled up.' },
    { name: 'War Cry', description: 'Friendly Orks with the **Waaagh!** ability become riled up.' },
  ])
})

it('uses a sole catalogue army rule when the faction card prints no army ability', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'titan.json'), {
    name: 'Adeptus Titanicus',
    datasheets: [{ abilities: { faction: [{ name: { en: 'Super-heavy Walker' } }] } }],
    detachments: [],
    rules: { army: [] },
  })
  write(path.join(directory, 'definitions', 'Imperium - Adeptus Titanicus.json'), {
    catalogue: {
      name: 'Imperium - Adeptus Titanicus',
      rules: [{ id: 'towering', name: 'Towering Example', description: 'Choose one Titan as your Warlord.' }],
    },
  })
  expect(rules().supplementalArmyRules.get('adeptus-titanicus')).toEqual([
    { name: 'Towering Example', description: 'Choose one Titan as your Warlord.' },
  ])
})

it('leaves an ambiguous catalogue army rule unselected', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'titan.json'), {
    name: 'Adeptus Titanicus',
    datasheets: [],
    detachments: [],
    rules: { army: [] },
  })
  write(path.join(directory, 'definitions', 'Imperium - Adeptus Titanicus.json'), {
    catalogue: {
      name: 'Imperium - Adeptus Titanicus',
      rules: [
        { id: 'first', name: 'Towering Example', description: 'One rule.' },
        { id: 'second', name: 'Other Rule', description: 'Another rule.' },
      ],
    },
  })
  expect(rules().supplementalArmyRules.has('adeptus-titanicus')).toBe(false)
})

it('shows a sole catalogue army rule when the faction has no datacards file', () => {
  write(path.join(directory, 'definitions', 'Chaos - Titanicus Traitoris.json'), {
    catalogue: {
      name: 'Chaos - Titanicus Traitoris',
      rules: [{ id: 'towering', name: 'Towering Example', description: 'Choose one Chaos Titan as your Warlord.' }],
    },
  })
  write(path.join(directory, 'definitions', 'Imperium - Adeptus Titanicus.json'), {
    catalogue: {
      name: 'Imperium - Adeptus Titanicus',
      rules: [{ id: 'loyalist', name: 'Towering Example', description: 'Choose one Imperial Titan as your Warlord.' }],
    },
  })
  const catalogue = bookOf({
    name: 'Chaos - Titanicus Traitoris',
    selectionEntries: [{ id: 'warhound', name: 'Warhound Titan', type: 'model' }],
  })
  expect(factionsFor(catalogue, rules()).factions[0]?.armyRules).toEqual([
    { name: 'Towering Example', description: 'Choose one Chaos Titan as your Warlord.' },
  ])
})

it('leaves army rules ambiguous when the faction has no datacards file', () => {
  write(path.join(directory, 'definitions', 'Chaos - Titanicus Traitoris.json'), {
    catalogue: {
      name: 'Chaos - Titanicus Traitoris',
      rules: [
        { id: 'first', name: 'Towering Example', description: 'One rule.' },
        { id: 'second', name: 'Other Rule', description: 'Another rule.' },
      ],
    },
  })
  expect(rules().supplementalArmyRules.has('titanicus-traitoris')).toBe(false)
})

it('does not publish a library as a faction when it has no datacards file', () => {
  write(path.join(directory, 'definitions', 'Library - Titans.json'), {
    catalogue: {
      name: 'Library - Titans',
      library: true,
      rules: [{ id: 'towering', name: 'Towering Example', description: 'One rule.' }],
    },
  })
  expect(rules().supplementalArmyRules.has('titans')).toBe(false)
})

it('reads a missing ability from its faction library alias', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'aeldari.json'), {
    name: 'Asuryani',
    datasheets: [{ abilities: { faction: [{ name: { en: 'Disparate Paths' } }] } }],
    detachments: [],
  })
  write(path.join(directory, 'definitions', 'Aeldari - Aeldari Library.json'), {
    catalogue: { name: 'Aeldari - Aeldari Library', rules: [{ id: 'paths', name: 'Disparate Paths', description: 'One path.' }] },
  })
  expect(rules().supplementalArmyRules.get('asuryani')).toEqual([{ name: 'Disparate Paths', description: 'One path.' }])
})

it('rejects a conflicting catalogue army ability', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'orks.json'), {
    name: 'Orks',
    datasheets: [{ abilities: { faction: [{ name: { en: 'Waaagh!' } }] } }],
    detachments: [],
  })
  write(path.join(directory, 'definitions', 'Orks.json'), {
    catalogue: {
      name: 'Xenos - Orks',
      rules: [
        { id: 'first', name: 'Waaagh!', description: 'First wording.' },
        { id: 'second', name: 'Waaagh!', description: 'Conflicting wording.' },
      ],
    },
  })
  expect(rules().supplementalArmyRules.has('orks')).toBe(false)
})

it('uses an exact Game Datacards ability definition omitted from a faction file', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'titan.json'), {
    name: 'Adeptus Titanicus',
    datasheets: [{ abilities: { faction: [{ name: { en: 'Super-heavy Walker' } }] } }],
    detachments: [],
  })
  write(path.join(directory, 'datacards', '11th', 'gdc', 'keywords.json'), {
    keywords: [
      { name: 'Super-heavy Walker', description: 'Walk through terrain.', matchType: 'exact', appliesTo: ['abilities'] },
      { name: 'Super-heavy Walker', description: 'Unrelated keyword.', matchType: 'exact', appliesTo: ['keywords'] },
    ],
  })
  expect(rules().supplementalArmyRules.get('adeptus-titanicus')).toEqual([
    { name: 'Super-heavy Walker', description: 'Walk through terrain.' },
  ])
})

it('leaves conflicting Game Datacards ability definitions unresolved', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'titan.json'), {
    name: 'Adeptus Titanicus',
    datasheets: [{ abilities: { faction: [{ name: { en: 'Super-heavy Walker' } }] } }],
    detachments: [],
  })
  write(path.join(directory, 'datacards', '11th', 'gdc', 'keywords.json'), {
    keywords: [
      { name: 'Super-heavy Walker', description: 'First wording.', matchType: 'exact', appliesTo: ['abilities'] },
      { name: 'Super-heavy Walker', description: 'Second wording.', matchType: 'exact', appliesTo: ['abilities'] },
    ],
  })
  expect(rules().supplementalArmyRules.has('adeptus-titanicus')).toBe(false)
})

it('joins an army rule despite differences in name capitalization', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'drukhari.json'), {
    name: 'Drukhari',
    datasheets: [{ abilities: { faction: [{ name: { en: 'Power from Pain' } }] } }],
    detachments: [],
    rules: { army: [{ name: { en: 'Power From Pain' }, rules: [{ type: 'text', text: { en: 'Gain pain tokens.' } }] }] },
  })
  expect(rules().factionRules.get('drukhari')?.name).toBe('Power From Pain')
})

it('finds the primary from its declared force disposition pairing', () => {
  expect(missionFor(rules(), 'disruption', 'take-and-hold', 'chapter-approved')).toMatchObject({
    id: 'primary-1',
    roundCap: 15,
    gameCap: 45,
    deploymentIds: ['deploy-1'],
    fixedSecondaryCap: 20,
  })
})

it('keeps a selected pack from falling through to another pack', () => {
  expect(missionFor(rules(), 'disruption', 'take-and-hold', 'other-pack')).toBeNull()
})

it('schedules only scoring moments declared by the card', () => {
  expect(rules().primaries[0]?.awards).toEqual([
    expect.objectContaining({
      vp: 5,
      per: 'each',
      criteria: 'For each objective you control.',
      trigger: { timing: 'end-of-turn', phase: null, playerTurn: 'your-turn', roundMin: 2, roundMax: 3 },
    }),
  ])
})

it('groups every tier when a later scoring row marks the tiers exclusive', () => {
  const value = JSON.parse(fs.readFileSync(pack(), 'utf8'))
  value.secondaryMissions[0].objectives[0].id = 'tiers'
  value.secondaryMissions[0].objectives[0].scoring = [
    { scoringType: 'fixed', victoryPoints: 2, scoringCriteria: { en: 'Three quarters.' }, isMutuallyExclusive: false },
    { scoringType: 'tactical', victoryPoints: 3, scoringCriteria: { en: 'Three quarters.' }, isMutuallyExclusive: false },
    { scoringType: 'fixed', victoryPoints: 4, scoringCriteria: { en: 'Four quarters.' }, isMutuallyExclusive: true },
    { scoringType: 'tactical', victoryPoints: 5, scoringCriteria: { en: 'Four quarters.' }, isMutuallyExclusive: true },
  ]
  write(pack(), value)
  expect(rules().secondaries[0]?.awards.map((award) => award.group)).toEqual([
    'tiers:fixed',
    'tiers:tactical',
    'tiers:fixed',
    'tiers:tactical',
  ])
})

it('keeps deployments named without inventing their missing polygons', () => {
  expect(rules().deployments).toEqual([{ id: 'deploy-1', name: 'Tipping Point', description: null, zones: [], objectives: [] }])
})

it('keeps a layout unavailable when its exact terrain geometry is missing', () => {
  expect(rules().terrainLayouts).toEqual([
    expect.objectContaining({
      id: 'layout-1',
      matchupId: 'disruption-vs-take-and-hold',
      deploymentId: 'deploy-1',
      geometry: null,
    }),
  ])
})

it('matches the pinned Battlemaster slot to its Game Datacards layout', () => {
  const id = 'terrain-01234567-89ab-cdef-0123-456789abcdef'
  write(path.join(directory, 'battlemaster', 'catalog.json'), { layouts: [{ id }] })
  write(path.join(directory, 'battlemaster', 'layouts', `${id}.json`), {
    layout: { id, chapterApprovedSlot: { archetypeA: 'disruption', archetypeB: 'take-and-hold', slotIndex: 1 } },
    terrain: [
      {
        name: 'Area AB',
        footprint: { origin: { x: 0, y: 0 }, widthIn: 4, heightIn: 4, rotationDeg: 0 },
        outline: {
          points: [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 4, y: 4 },
          ],
        },
        parts: [],
      },
    ],
  })
  expect(rules().terrainLayouts[0]?.geometry?.areas[0]?.points).toEqual([
    { x: 30, y: 22 },
    { x: 34, y: 22 },
    { x: 34, y: 18 },
  ])
})

it('reads deployment zones and objectives from its matched Battlemaster detail', () => {
  const id = 'terrain-01234567-89ab-cdef-0123-456789abcdef'
  write(path.join(directory, 'battlemaster', 'catalog.json'), { layouts: [{ id }] })
  write(path.join(directory, 'battlemaster', 'layouts', `${id}.json`), {
    layout: { id, chapterApprovedSlot: { archetypeA: 'disruption', archetypeB: 'take-and-hold', slotIndex: 1 } },
    terrain: [
      {
        name: 'Area AB',
        footprint: { origin: { x: 0, y: 0 }, widthIn: 4, heightIn: 4, rotationDeg: 0 },
        outline: {
          points: [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 4, y: 4 },
          ],
        },
        parts: [],
      },
    ],
    deployment: {
      name: 'TIPPING POINT',
      board: { widthIn: 60, heightIn: 44 },
      zones: [
        {
          role: 'attacker',
          points: [
            { x: -30, y: 22 },
            { x: -20, y: 22 },
            { x: -30, y: 12 },
          ],
        },
        {
          role: 'defender',
          points: [
            { x: 30, y: -22 },
            { x: 20, y: -22 },
            { x: 30, y: -12 },
          ],
        },
      ],
      objectives: [
        { center: { x: 0, y: 0 } },
        { center: { x: -20, y: 12 } },
        { center: { x: 20, y: -12 } },
        { center: { x: -10, y: -12 } },
        { center: { x: 10, y: 12 } },
      ],
    },
  })
  expect(rules().deployments[0]).toMatchObject({
    zones: [
      {
        player: 'attacker',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: 10 },
        ],
      },
      {
        player: 'defender',
        points: [
          { x: 60, y: 44 },
          { x: 50, y: 44 },
          { x: 60, y: 34 },
        ],
      },
    ],
    objectives: [
      { x: 30, y: 22 },
      { x: 10, y: 10 },
      { x: 50, y: 34 },
      { x: 20, y: 34 },
      { x: 40, y: 10 },
    ],
  })
})

it('does not schedule an unrecognized scoring time', () => {
  const value = JSON.parse(fs.readFileSync(pack(), 'utf8'))
  value.secondaryMissions[0].objectives[0].whenText.en = 'At an unspecified time.'
  write(pack(), value)
  expect(rules().secondaries[0]?.awards).toEqual([])
})

it('keeps optional first-round redraws optional', () => {
  const cards = missionCardsFromDatacards([
    {
      secondaryMissions: [
        {
          id: 'optional',
          name: { en: 'Forward Position' },
          description: {
            en: '**WHEN DRAWN:** If it is the first battle round, you can draw one new **Secondary Mission** card and shuffle this card back into your **Secondary Mission** deck.',
          },
          objectives: [],
        },
      ],
    },
  ])
  expect(cards.secondaries[0]?.whenDrawn).toEqual({ operation: 'redraw', roundMax: 1, required: false, heldCards: [], condition: null })
})

it('requires a first-round return only when the source requires it', () => {
  const cards = missionCardsFromDatacards([
    {
      secondaryMissions: [
        {
          id: 'required',
          name: { en: 'Defend Stronghold' },
          description: {
            en: '**WHEN DRAWN:** If it is the first battle round, draw one new **Secondary Mission** card and shuffle this card back into your **Secondary Mission** deck.',
          },
          objectives: [],
        },
      ],
    },
  ])
  expect(cards.secondaries[0]?.whenDrawn?.required).toBe(true)
})

it('preserves the fifth-round fallback on opponent-turn secondaries', () => {
  const cards = missionCardsFromDatacards([
    {
      secondaryMissions: [
        {
          id: 'beacon',
          name: { en: 'Beacon' },
          objectives: [
            {
              whenText: { en: 'End of your opponent’s turn or the end of the fifth battle round (whichever comes first).' },
              scoring: [{ scoringCriteria: { en: 'Hold the beacon.' }, victoryPoints: 5 }],
            },
          ],
        },
      ],
    },
  ])
  expect(cards.secondaries[0]?.awards[0]?.trigger.timing).toBe('end-of-turn-or-final-round')
})
