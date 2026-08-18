import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadRules, missionFor } from './rules'

let directory: string

/** A dataset small enough to read, shaped exactly like the real one. */
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-rules-'))
  const core = path.join(directory, 'data', 'core', 'death-guard')
  fs.mkdirSync(core, { recursive: true })
  const root = path.join(directory, 'data', 'core')

  write(path.join(core, 'stratagems.json'), [
    {
      id: 'grim-reapers-flyblown-host',
      name: 'GRIM REAPERS',
      detachment_id: 'flyblown-host',
      cp_cost: 1,
      timing: 'once-per-phase',
      game_version: { edition: '11th', dataslate: 'launch' },
    },
    { id: 'mortarions-teachings', name: "MORTARION'S TEACHINGS", detachment_id: 'flyblown-host', cp_cost: 2, timing: 'unknown-timing' },
  ])
  write(path.join(core, 'detachments.json'), [
    {
      id: 'flyblown-host',
      name: 'Flyblown Host',
      enhancement_ids: ['living-plague', 'rejuvenating-swarm', 'virulent-carapace'],
      stratagem_ids: ['grim-reapers', 'mortarions-teachings'],
      detachment_points: 2,
      force_dispositions: ['disruption'],
    },
  ])
  write(path.join(core, 'enhancements.json'), [
    { id: 'living-plague', name: 'Living Plague', detachment_id: 'flyblown-host', cost: 20 },
    { id: 'rejuvenating-swarm', name: 'Rejuvenating Swarm', detachment_id: 'flyblown-host', cost: 10 },
    { id: 'virulent-carapace', name: 'Virulent Carapace (Upgrade)', detachment_id: 'flyblown-host', cost: 15 },
  ])
  write(path.join(core, 'factions.json'), [{ id: 'death-guard', name: 'Death Guard' }])
  const wahapedia = path.join(directory, 'wahapedia')
  fs.mkdirSync(wahapedia)
  fs.writeFileSync(
    path.join(wahapedia, 'Detachment_abilities.csv'),
    'name|detachment|description|\nVirulent Vectorium|Flyblown Host|<b>Spread disease.</b>|\n',
  )
  fs.writeFileSync(
    path.join(wahapedia, 'Abilities.csv'),
    'name|description|\nOath of Moment|Re-roll Hit rolls.|\nDeathwatch|Your army cannot include any of the following units: Scout Squad; Tactical Squad.|\n',
  )
  fs.writeFileSync(
    path.join(wahapedia, 'Stratagems.csv'),
    'name|detachment|description|\nGRIM REAPERS|Flyblown Host|<b>Cut them down.</b>|\n',
  )
  fs.writeFileSync(
    path.join(wahapedia, 'Enhancements.csv'),
    'name|detachment|description|\nLiving Plague|Flyblown Host|<b>Spread the plague.</b>|\nRejuvinating Swarm|Flyblown Host|Return models.|\nVirulent Carapace (Upgrade)|Flyblown Host|Improve the unit.|\n',
  )
  write(path.join(root, 'stratagems.json'), [{ id: 'command-re-roll', name: 'COMMAND RE-ROLL', cp_cost: 1, timing: 'once-per-battle' }])
  write(path.join(root, 'secondary-cards.json'), [
    {
      id: 'assassination',
      name: 'Assassination',
      card_type: 'secondary',
      awards: [
        { vp: 5, mode: 'tactical' },
        { vp_per: 3, per: 'kill' },
      ],
    },
    { id: 'battlefield-dominance', name: 'Battlefield Dominance', card_type: 'primary', awards: [{ vp: 2 }] },
  ])
  write(path.join(root, 'missions.json'), [{ id: 'death-trap', name: 'Death Trap', vp_per_round_cap: 15, vp_per_game_cap: 45 }])
  write(path.join(root, 'mission-matchups.json'), [
    { disposition: 'disruption', opponent_disposition: 'take-and-hold', mission_id: 'death-trap' },
  ])
  write(path.join(root, 'force-dispositions.json'), [{ id: 'disruption', name: 'Disruption' }])
  write(path.join(root, 'deployment-patterns.json'), [
    {
      id: 'tipping-point',
      name: 'Tipping Point',
      zones: [
        { player: 'defender', name: 'Defender', color: '#00f', position: { x: 0, y: 0 }, shape: { points: box(20, 44) } },
        { player: 'attacker', name: 'Attacker', color: '#f00', position: { x: 40, y: 0 }, shape: { points: box(20, 44) } },
      ],
      objectives: [{ x: 30, y: 22 }],
    },
  ])
})

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

const write = (file: string, value: unknown) => fs.writeFileSync(file, JSON.stringify(value))
const box = (width: number, height: number) => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: height },
  { x: 0, y: height },
]

const load = () => loadRules(directory, path.join(directory, 'wahapedia'))!

describe('stratagems', () => {
  it('keeps descriptions that supplement datasheet abilities', () => {
    expect(load().abilityDescriptions.get('oath-of-moment')).toBe('Re-roll Hit rolls.')
  })

  it('keeps the player-facing faction name', () => {
    expect(load().factionNames.get('death-guard')).toBe('Death Guard')
  })

  it('reads faction restrictions from army rules', () => {
    expect(load().factionRestrictions.get('deathwatch')).toEqual({
      excludedNames: new Set(['scout squad', 'tactical squad']),
      excludedKeywords: new Set(),
    })
  })

  it('keeps the reference metadata for each detachment', () => {
    expect(load().detachmentReferences.get('death-guard')?.get('flyblown-host')).toEqual({
      enhancements: 2,
      upgrades: 1,
      stratagems: 2,
      points: 2,
      dispositions: ['disruption'],
    })
  })

  it('keeps the detail needed by the detachment reference page', () => {
    expect(load().detachmentDetails.get('death-guard')?.get('flyblown-host')).toMatchObject({
      rules: [{ name: 'Virulent Vectorium', description: 'Spread disease.' }],
      enhancements: [
        { name: 'Living Plague', points: 20, description: 'Spread the plague.' },
        { name: 'Rejuvenating Swarm', points: 10, description: 'Return models.' },
      ],
      upgrades: [{ name: 'Virulent Carapace', points: 15, description: 'Improve the unit.' }],
      stratagems: expect.arrayContaining([expect.objectContaining({ name: 'Grim Reapers', cp: 1, description: 'Cut them down.' })]),
    })
  })

  it('are grouped under the detachment that brings them', () => {
    expect(load().byDetachment.get('death-guard')?.get('flyblown-host')).toHaveLength(2)
  })

  it('take the usage limit the dataset states', () => {
    const found = load().byDetachment.get('death-guard')?.get('flyblown-host')?.[0]
    expect(found?.limit).toBe('phase')
  })

  it('fall back to unlimited rather than inventing a restriction', () => {
    // Guessing here would stop a player using something they are entitled to.
    const found = load().byDetachment.get('death-guard')?.get('flyblown-host')?.[1]
    expect(found?.limit).toBe('unlimited')
  })

  it('are titled rather than shouted, apostrophes included', () => {
    const found = load().byDetachment.get('death-guard')?.get('flyblown-host')?.[1]
    expect(found?.name).toBe("Mortarion's Teachings")
  })

  it('include the ones every army has', () => {
    expect(load().core.map((stratagem) => stratagem.name)).toEqual(['Command Re-Roll'])
  })
})

describe('mission cards', () => {
  it('separate the primary from the secondaries', () => {
    expect(load().secondaries.map((card) => card.name)).toEqual(['Assassination'])
  })

  it('keep what each payout is worth', () => {
    expect(load().secondaries[0]?.awards.map((award) => award.vp)).toEqual([5, 3])
  })

  it('keep which style of play a payout belongs to', () => {
    expect(load().secondaries[0]?.awards[0]?.mode).toBe('tactical')
  })
})

describe('the mission', () => {
  it('comes from the pair of dispositions, in either order', () => {
    expect(missionFor(load(), 'take-and-hold', 'disruption')?.name).toBe('Death Trap')
  })

  it('carries the caps the mission itself states', () => {
    expect(missionFor(load(), 'disruption', 'take-and-hold')).toMatchObject({ roundCap: 15, gameCap: 45 })
  })

  it('is absent until both dispositions are known', () => {
    expect(missionFor(load(), 'disruption', null)).toBeNull()
  })

  it('constrains a matchup to the selected mission pack', () => {
    const root = path.join(directory, 'data', 'core')
    write(path.join(root, 'missions.json'), [
      { id: 'pack-a-mission', name: 'Pack A Mission', source: 'Pack A' },
      { id: 'pack-b-mission', name: 'Pack B Mission', source: 'Pack B' },
    ])
    write(path.join(root, 'mission-matchups.json'), [
      { disposition: 'disruption', opponent_disposition: 'take-and-hold', mission_id: 'pack-a-mission' },
      { disposition: 'disruption', opponent_disposition: 'take-and-hold', mission_id: 'pack-b-mission' },
    ])

    expect(missionFor(load(), 'disruption', 'take-and-hold', 'pack-b')?.name).toBe('Pack B Mission')
  })

  it('does not fall through to another modern mission pack', () => {
    const root = path.join(directory, 'data', 'core')
    write(path.join(root, 'missions.json'), [{ id: 'pack-a-mission', name: 'Pack A Mission', source: 'Pack A' }])
    write(path.join(root, 'mission-matchups.json'), [
      { disposition: 'disruption', opponent_disposition: 'take-and-hold', mission_id: 'pack-a-mission' },
    ])

    expect(missionFor(load(), 'disruption', 'take-and-hold', 'pack-b')).toBeNull()
  })

  it('keeps the unqualified mission fallback for legacy battles', () => {
    expect(missionFor(load(), 'disruption', 'take-and-hold', null)?.name).toBe('Death Trap')
  })
})

describe('a deployment pattern', () => {
  it('offsets each zone by its own position', () => {
    // Without this every zone piles into one corner, which is what the first
    // drawing of the battlefield did.
    const zones = load().deployments[0]?.zones ?? []
    expect(zones.map((zone) => Math.min(...zone.points.map((point) => point.x)))).toEqual([0, 40])
  })

  it('keeps the objective markers', () => {
    expect(load().deployments[0]?.objectives).toEqual([{ x: 30, y: 22 }])
  })
})

describe('Battlemaster terrain geometry', () => {
  it('accepts the current detail identity used by the public API', () => {
    const id = 'terrain-01234567-89ab-cdef-0123-456789abcdef'
    const root = path.join(directory, 'data', 'core')
    write(path.join(root, 'terrain-layouts.json'), [
      {
        id: 'layout-a',
        name: 'Layout A',
        mission_matchup_id: 'disruption-vs-take-and-hold',
        description: `Imported from Battlemaster layout ${id}.`,
        pieces: [],
      },
    ])
    const battlemaster = path.join(directory, 'battlemaster', 'layouts')
    fs.mkdirSync(battlemaster, { recursive: true })
    write(path.join(battlemaster, `${id}.json`), {
      format: 'battlemaster.data.layout',
      layout: { links: { page: `https://battlemaster.online/community/layout/owner/${id}` } },
      terrain: [
        {
          name: 'Area AB',
          footprint: { origin: { x: 0, y: 0 }, widthIn: 10, heightIn: 10, rotationDeg: 0 },
          outline: { points: box(10, 10) },
          parts: [],
        },
      ],
    })

    const rules = loadRules(directory, path.join(directory, 'wahapedia'), path.join(directory, 'battlemaster'))!

    expect(rules.terrainLayouts[0]?.geometry?.areas[0]).toMatchObject({
      id: 'area-1',
      markers: [{ label: 'AB', position: { x: 35, y: 17 } }],
    })
  })
})
