import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import composition from '../../catalogue/composition.json' with { type: 'json' }
import { loadRules } from './rules'
import { wordsFrom } from './sourceTexts.fixtures'
import { hasDetachmentSemantics, missionFor } from '../shared/rules'
import type { VsDataMissionPack, VsDataStratagem, VsDataSummariesFile } from '../shared/vsData'
import { missionPack } from './vsData.fixtures'
import { bookOf } from './catalogue.fixtures'
import { factionsFor } from '../shared/factionReferences'

let directory: string
const write = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}
const rules = () => loadRules(directory)!
const base = composition.editions.find((entry) => 'base' in entry && entry.base)!

const reapers: VsDataStratagem = {
  id: 'death-guard.flyblown-host.grim-reapers',
  name: 'Grim Reapers',
  detachment: 'Flyblown Host',
  cp: 1,
  phases: ['fight'],
  turn: 'any',
  type: 'battle-tactic',
  limit: 'phase',
}
const reroll: VsDataStratagem = {
  id: 'core.command-re-roll',
  name: 'Command Re-roll',
  detachment: null,
  cp: 1,
  phases: ['command', 'movement', 'shooting', 'charge', 'fight', 'end-of-turn'],
  turn: 'any',
  type: null,
  limit: 'phase',
}
const pack = missionPack({
  id: 'chapter-approved',
  name: 'Chapter Approved',
  caps: { primary: { perRound: 15, perBattle: 45 }, secondary: { perRound: 15, perBattle: 45 }, fixedSecondaryPerCard: { perBattle: 20 } },
  dispositions: [
    { id: 'chapter-approved.disruption', name: 'Disruption', aliases: [] },
    { id: 'chapter-approved.take-and-hold', name: 'Take and Hold', aliases: [] },
  ],
  deployments: [{ id: 'chapter-approved.tipping-point', name: 'Tipping Point', aliases: [] }],
  layouts: [
    {
      id: 'chapter-approved.disruption-take-and-hold-layout-a',
      name: 'Disruption / Take and Hold - Layout A',
      aliases: [],
      deployments: ['chapter-approved.tipping-point'],
    },
  ],
  primaries: [
    {
      id: 'chapter-approved.death-trap',
      name: 'Death Trap',
      aliases: [],
      pairings: [
        {
          friendly: 'chapter-approved.disruption',
          opposition: 'chapter-approved.take-and-hold',
          deployments: ['chapter-approved.tipping-point'],
          layouts: ['chapter-approved.disruption-take-and-hold-layout-a'],
        },
      ],
      awards: [
        {
          id: 'chapter-approved.death-trap.o1-s1',
          vp: 5,
          count: 'each',
          criterion: { summary: 'Gain 5 VP per objective you control.' },
          windows: [{ at: 'turn-end', turn: 'own', rounds: { from: 2, to: 3 } }],
        },
      ],
    },
  ],
  secondaries: [
    {
      id: 'chapter-approved.no-prisoners',
      name: 'No Prisoners',
      aliases: [],
      modes: ['tactical'],
      awards: [
        {
          id: 'chapter-approved.no-prisoners.o1-s1',
          vp: 4,
          count: 'once',
          modes: ['tactical'],
          criterion: { summary: 'Destroy an enemy unit.' },
          windows: [{ at: 'turn-end', turn: 'any' }],
        },
      ],
    },
  ],
})

/** The snapshot's VS Data release for the base rules version, holding these Stratagems and mission packs. */
function release({
  stratagems = [reapers, reroll],
  missionPacks = [pack],
}: {
  stratagems?: VsDataStratagem[]
  missionPacks?: VsDataMissionPack[]
}) {
  const file: VsDataSummariesFile = {
    release: '0.1.0',
    rulesVersion: { edition: '11th', update: base.edition.name },
    entries: Object.fromEntries(
      stratagems.map((stratagem) => [`ability:${stratagem.id}`, [`gdc.stratagem.${stratagem.id.split('.').at(-1)}`]]),
    ),
    attributions: [],
    stratagems,
    missionPacks,
    missionActions: [],
    detachments: [],
    units: {},
    records: [],
  }
  write(path.join(directory, 'summaries', `${base.edition.id}.json`), file)
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-datacard-rules-'))
  write(path.join(directory, 'composition.json'), { ...composition, editions: [base] })
  const datacards = path.join(directory, 'datacards', '11th', 'gdc')
  write(path.join(datacards, 'deathguard.json'), {
    name: 'Death Guard',
    datasheets: [],
    detachments: [{ name: { en: 'Flyblown Host' }, detachmentPoints: 2, forceDisposition: { name: { en: 'Disruption' } } }],
    enhancements: [
      { id: 'relic', name: { en: 'Living Plague' }, detachment: 'Flyblown Host', cost: 20, description: { en: 'Spread disease.' } },
    ],
    stratagems: [{ id: 'grim-reapers', name: { en: 'Grim Reapers' }, detachment: 'Flyblown Host', effect: { en: 'Cut them down.' } }],
  })
  write(path.join(datacards, 'core.json'), {
    stratagems: [{ id: 'command-re-roll', name: { en: 'Command Re-roll' }, effect: { en: 'Re-roll.' } }],
  })
  release({})
})

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

it('loads VS Data Stratagems and mission cards by their IDs', () => {
  expect(rules()).toMatchObject({
    core: [{ key: 'core.command-re-roll', name: 'Command Re-roll' }],
    primaries: [{ key: 'chapter-approved.death-trap', name: 'Death Trap' }],
    secondaries: [{ key: 'chapter-approved.no-prisoners', name: 'No Prisoners' }],
  })
})

it('scores an end-of-battle window at the end of the battle', () => {
  const primary = { ...pack.primaries[0]!, awards: [{ ...pack.primaries[0]!.awards[0]!, windows: [{ at: 'battle-end' as const }] }] }
  release({ missionPacks: [{ ...pack, primaries: [primary] }] })
  expect(rules().primaries[0]?.awards[0]?.trigger.timing).toBe('end-of-battle')
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
})

it('uses the current detachment points and its VS Data Stratagems', () => {
  expect(rules().detachmentDetails.get('death-guard')?.get('flyblown-host')).toMatchObject({
    points: 2,
    dispositions: ['disruption'],
    stratagems: [{ id: 'death-guard.flyblown-host.grim-reapers', cp: 1, phases: ['fight'], turn: 'either', type: 'Battle Tactic' }],
    enhancements: [{ name: 'Living Plague', points: 20, eligibility: null }],
  })
})

it('describes a Stratagem with the Game Datacards card VS Data aliases', () => {
  const [card] = rules().detachmentDetails.get('death-guard')?.get('flyblown-host')?.stratagems ?? []
  expect(card?.description && wordsFrom(directory)(card.description)).toBe('**Effect:** Cut them down.')
})

it('leaves a Stratagem usable in any phase without a phase', () => {
  expect(rules().core[0]).toEqual({ key: 'core.command-re-roll', name: 'Command Re-roll', cp: 1, limit: 'phase', turn: 'either' })
})

it('takes the core rules’ once per phase limit where a Stratagem’s facts state none', () => {
  release({ stratagems: [{ ...reapers, limit: null }] })
  expect(rules().byDetachment.get('death-guard')?.get('flyblown-host')?.[0]?.limit).toBe('phase')
})

it('keeps a Stratagem out of the end of a turn where VS Data leaves that phase out', () => {
  release({ stratagems: [{ ...reroll, phases: ['command', 'movement', 'shooting', 'charge', 'fight'] }] })
  expect(rules().core[0]?.phases).toEqual(['command', 'movement', 'shooting', 'charge', 'fight'])
})

it('times a Stratagem by the turn each of its phases is in', () => {
  release({
    stratagems: [
      {
        ...reapers,
        phases: ['shooting', 'fight'],
        windows: [
          { phase: 'shooting', turn: 'opponent' },
          { phase: 'fight', turn: 'any' },
        ],
      },
    ],
  })
  expect(rules().byDetachment.get('death-guard')?.get('flyblown-host')?.[0]?.windows).toEqual([
    { phase: 'shooting', turn: 'opponent-turn' },
    { phase: 'fight', turn: 'either' },
  ])
})

it('fills a Detachment its release does not list from the base release’s printed cards', () => {
  write(path.join(directory, 'summaries', 'earlier.json'), {
    release: '0.1.0',
    rulesVersion: { edition: '11th', update: 'Earlier' },
    entries: {},
    attributions: [],
    stratagems: [],
    records: [],
  })
  expect(
    loadRules(directory, { rulesVersion: 'earlier' })!
      .byDetachment.get('death-guard')
      ?.get('flyblown-host')
      ?.map((card) => card.key),
  ).toEqual([reapers.id])
})

it('takes a retained Detachment’s Stratagems from its listing, and names the printed ones its release does not publish', () => {
  const card = (id: string, detachment: string): VsDataStratagem => ({ ...reapers, id, name: id, detachment })
  release({ stratagems: [reapers, card('death-guard.plague-host.tide', 'Plague Host'), reroll] })
  const retained: VsDataSummariesFile = {
    release: '0.1.0',
    rulesVersion: { edition: '11th', update: 'Earlier' },
    entries: {},
    attributions: [],
    stratagems: [card('death-guard.plague-host.miasma', 'Flyblown Host')],
    missionPacks: [],
    missionActions: [],
    detachments: [
      {
        name: 'Flyblown Host',
        stratagems: ['death-guard.plague-host.miasma', 'death-guard.plague-host.tide'],
        stratagemsUnlisted: ['Rot Unbound'],
        enhancements: [],
        enhancementsUnlisted: [],
      },
    ],
    units: {},
    records: [],
  }
  write(path.join(directory, 'summaries', 'earlier.json'), retained)
  const loaded = loadRules(directory, { rulesVersion: 'earlier' })!
  expect([
    loaded.byDetachment
      .get('death-guard')
      ?.get('flyblown-host')
      ?.map((stratagem) => stratagem.key),
    loaded.detachmentDetails
      .get('death-guard')
      ?.get('flyblown-host')
      ?.stratagems.map((stratagem) => [stratagem.name, stratagem.cp]),
  ]).toEqual([
    ['death-guard.plague-host.miasma', 'death-guard.plague-host.tide'],
    [
      ['Rot Unbound', null],
      ['death-guard.plague-host.miasma', 1],
      ['death-guard.plague-host.tide', 1],
    ],
  ])
})

it('plays a printed card its release does not publish as a release types the Game Datacards card of that name', () => {
  write(path.join(directory, 'summaries', 'earlier.json'), {
    release: '0.1.0',
    rulesVersion: { edition: '11th', update: 'Earlier' },
    entries: { [`ability:${reapers.id}`]: ['gdc.stratagem.grim.reapers'] },
    attributions: [],
    stratagems: [],
    detachments: [
      { name: 'Flyblown Host', stratagems: [], stratagemsUnlisted: ['Grim Reapers'], enhancements: [], enhancementsUnlisted: [] },
    ],
    records: [],
  })
  expect(
    loadRules(directory, { rulesVersion: 'earlier' })!
      .byDetachment.get('death-guard')
      ?.get('flyblown-host')
      ?.map((card) => card.key),
  ).toEqual([reapers.id])
})

it('drops a Detachment a rules version’s build does not have', () => {
  write(path.join(directory, 'summaries', 'earlier.json'), {
    release: '0.1.0',
    rulesVersion: { edition: '11th', update: 'Earlier' },
    entries: {},
    attributions: [],
    stratagems: [],
    detachments: [
      { name: 'Flyblown Host', absent: true, stratagems: [], stratagemsUnlisted: [], enhancements: [], enhancementsUnlisted: [] },
    ],
    records: [],
  })
  const loaded = loadRules(directory, { rulesVersion: 'earlier' })!
  expect([
    loaded.byDetachment.get('death-guard')?.has('flyblown-host') ?? false,
    loaded.detachmentDetails.get('death-guard')?.has('flyblown-host') ?? false,
  ]).toEqual([false, false])
})

it('shows a Stratagem’s turn for each of its phases on its detachment’s reference', () => {
  release({
    stratagems: [
      {
        ...reapers,
        phases: ['shooting', 'fight'],
        windows: [
          { phase: 'shooting', turn: 'opponent' },
          { phase: 'fight', turn: 'any' },
        ],
      },
    ],
  })
  expect(rules().detachmentDetails.get('death-guard')?.get('flyblown-host')?.stratagems[0]?.windows).toEqual([
    { phase: 'shooting', turn: 'opponent-turn' },
    { phase: 'fight', turn: 'either' },
  ])
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
  const words = wordsFrom(directory)
  expect(
    rules()
      .supplementalArmyRules.get('adeptus-titanicus')
      ?.map((rule) => ({ ...rule, description: words(rule.description) })),
  ).toEqual([{ name: 'Super-heavy Walker', description: 'Walk through terrain.' }])
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
    id: 'chapter-approved.death-trap',
    roundCap: 15,
    gameCap: 45,
    deploymentIds: ['chapter-approved.tipping-point'],
    fixedSecondaryCap: 20,
  })
})

it('keeps a selected pack from falling through to another pack', () => {
  expect(missionFor(rules(), 'disruption', 'take-and-hold', 'other-pack')).toBeNull()
})

it('schedules only scoring moments declared by the card', () => {
  expect(rules().primaries[0]?.awards).toEqual([
    {
      vp: 5,
      per: 'each',
      max: null,
      mode: null,
      group: null,
      id: 'chapter-approved.death-trap.o1-s1',
      criteria: null,
      trigger: { timing: 'end-of-turn', phase: null, playerTurn: 'your-turn', roundMin: 2, roundMax: 3 },
    },
  ])
})

it('groups the tiers of an exclusive objective played the same way', () => {
  const tier = (step: number, vp: number, mode: 'fixed' | 'tactical') => ({
    id: `chapter-approved.no-prisoners.o1-s${step}`,
    vp,
    count: 'once' as const,
    modes: [mode],
    exclusive: 'o1',
    criterion: { summary: 'Hold table quarters.' },
    windows: [{ at: 'turn-end' as const, turn: 'own' as const }],
  })
  const awards = [tier(1, 2, 'fixed'), tier(2, 3, 'tactical'), tier(3, 4, 'fixed'), tier(4, 5, 'tactical')]
  release({ missionPacks: [{ ...pack, secondaries: [{ ...pack.secondaries[0]!, modes: ['fixed', 'tactical'], awards }] }] })
  expect(rules().secondaries[0]?.awards.map((award) => award.group)).toEqual([
    'chapter-approved.no-prisoners:o1:fixed',
    'chapter-approved.no-prisoners:o1:tactical',
    'chapter-approved.no-prisoners:o1:fixed',
    'chapter-approved.no-prisoners:o1:tactical',
  ])
})

it('keeps deployments named without inventing their missing polygons', () => {
  expect(rules().deployments).toEqual([
    { id: 'chapter-approved.tipping-point', name: 'Tipping Point', description: null, zones: [], attackerTerritory: null, objectives: [] },
  ])
})

it('keeps a layout unavailable when its exact terrain geometry is missing', () => {
  expect(rules().terrainLayouts).toEqual([
    expect.objectContaining({
      id: 'chapter-approved.disruption-take-and-hold-layout-a',
      matchupId: 'disruption-vs-take-and-hold',
      deploymentId: 'chapter-approved.tipping-point',
      geometry: null,
    }),
  ])
})

it('matches the pinned Battlemaster slot to its mission pack layout', () => {
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

const secondary = (parts: Partial<VsDataMissionPack['secondaries'][number]>) => {
  release({ missionPacks: [{ ...pack, secondaries: [{ ...pack.secondaries[0]!, ...parts }] }] })
  return rules().secondaries[0]
}

it('does not schedule a scoring window VS Data leaves untyped', () => {
  const award = { ...pack.secondaries[0]!.awards[0]!, windows: [{ unresolved: 'not typed yet' }] }
  expect(secondary({ awards: [award] })?.awards).toEqual([])
})

it('keeps optional first-round redraws optional', () => {
  expect(secondary({ whenDrawn: { action: 'redraw', required: false, untilRound: 1 } })?.whenDrawn).toEqual({
    operation: 'redraw',
    roundMax: 1,
    required: false,
    heldCards: [],
  })
})

it('requires a first-round return only when the source requires it', () => {
  expect(secondary({ whenDrawn: { action: 'redraw', required: true, untilRound: 1 } })?.whenDrawn?.required).toBe(true)
})

it('leaves a when-drawn rule VS Data has not typed for the player to judge', () => {
  expect(secondary({ whenDrawn: { unresolved: 'not typed yet' } })?.whenDrawn).toEqual({
    operation: 'replace',
    roundMax: null,
    heldCards: [],
  })
})

it('lets a card go back while no enemy has a characteristic at a value', () => {
  const noEnemy = { entity: 'model' as const, characteristic: 'wounds' as const, min: 10 }
  expect(secondary({ whenDrawn: { action: 'redraw', required: false, ifNoEnemy: noEnemy } })?.whenDrawn).toEqual({
    operation: 'redraw',
    roundMax: null,
    required: false,
    heldCards: [],
    noEnemy,
  })
})

it('plays no cards from a pack that picks its primary by Detachment', () => {
  release({
    missionPacks: [
      pack,
      missionPack({
        id: 'combat-patrol',
        name: 'Combat Patrol',
        primaries: [{ ...pack.primaries[0]!, id: 'combat-patrol.slay', pairings: [] }],
      }),
    ],
  })
  expect(rules().primaries.map((card) => card.key)).toEqual(['chapter-approved.death-trap'])
})

it('preserves the fifth-round fallback on opponent-turn secondaries', () => {
  const award = {
    ...pack.secondaries[0]!.awards[0]!,
    windows: [{ at: 'turn-end' as const, turn: 'opponent' as const, orBattleEnd: true as const }],
  }
  expect(secondary({ awards: [award] })?.awards[0]?.trigger.timing).toBe('end-of-turn-or-final-round')
})

it('files chapter-specific detachments under their declared faction with complete cards', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'marines.json'), {
    name: 'Adeptus Astartes',
    datasheets: [],
    detachments: [
      {
        name: { en: "Forgefather's Seekers" },
        faction: 'Salamanders',
        detachmentPoints: 2,
        forceDisposition: { name: { en: 'Priority Assets' } },
      },
      { name: { en: 'Gladius Task Force' }, detachmentPoints: 3, forceDisposition: { name: { en: 'Take and Hold' } } },
    ],
    enhancements: [
      {
        id: 'relic',
        name: { en: 'Forged Relic' },
        detachment: "Forgefather's Seekers",
        cost: 15,
        description: { en: 'Protect the bearer.' },
      },
    ],
  })
  release({
    stratagems: [
      { ...reapers, id: 'salamanders.forgefathers-seekers.seek-the-relics', name: 'Seek the Relics', detachment: "Forgefather's Seekers" },
    ],
  })
  const loaded = rules()
  expect(loaded.detachmentDetails.get('salamanders')?.get('forgefathers-seekers')).toMatchObject({
    points: 2,
    dispositions: ['priority-assets'],
    enhancements: [{ name: 'Forged Relic', points: 15 }],
    stratagems: [{ name: 'Seek the Relics' }],
  })
})

it('does not publish chapter-specific detachments as generic parent rules', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'marines.json'), {
    name: 'Adeptus Astartes',
    datasheets: [],
    detachments: [
      {
        name: { en: "Forgefather's Seekers" },
        faction: 'Salamanders',
        detachmentPoints: 2,
        forceDisposition: { name: { en: 'Priority Assets' } },
      },
    ],
  })
  expect(rules().detachmentReferences.get('adeptus-astartes')?.has('forgefathers-seekers')).toBe(false)
})

it('inherits generic Marine cards without leaking another chapter’s detachment', () => {
  write(path.join(directory, 'datacards', '11th', 'gdc', 'marines.json'), {
    name: 'Adeptus Astartes',
    datasheets: [],
    detachments: [
      {
        name: { en: "Forgefather's Seekers" },
        faction: 'Salamanders',
        detachmentPoints: 2,
        forceDisposition: { name: { en: 'Priority Assets' } },
      },
      { name: { en: 'Shadowmark Talon' }, faction: 'Raven Guard', detachmentPoints: 2, forceDisposition: { name: { en: 'Disruption' } } },
      {
        name: { en: 'Gladius Task Force' },
        faction: 'Adeptus Astartes',
        detachmentPoints: 3,
        forceDisposition: { name: { en: 'Take and Hold' } },
      },
    ],
  })
  expect([...rules().detachmentReferences.get('salamanders')!.keys()].sort()).toEqual(['forgefathers-seekers', 'gladius-task-force'])
})

it('offers no Stratagems from a snapshot that holds no VS Data release', () => {
  fs.rmSync(path.join(directory, 'summaries'), { recursive: true })
  expect(loadRules(directory)?.byDetachment.get('death-guard')?.get('flyblown-host') ?? []).toEqual([])
})
