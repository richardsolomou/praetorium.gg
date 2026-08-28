import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hasDetachmentSemantics, loadRules, missionFor, rulesFaction } from './rules'

let directory: string

/** A dataset small enough to read, shaped exactly like the real one. */
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-rules-'))
  const core = path.join(directory, 'data', 'core', 'death-guard')
  fs.mkdirSync(core, { recursive: true })
  const root = path.join(directory, 'data', 'core')
  const imperialFists = path.join(root, 'imperial-fists')
  fs.mkdirSync(imperialFists)
  write(path.join(imperialFists, 'factions.json'), [
    { id: 'imperial-fists', name: 'Imperial Fists', parent_faction_id: 'adeptus-astartes' },
  ])
  write(path.join(imperialFists, 'detachments.json'), [{ id: 'stormlance-task-force', name: 'Stormlance Task Force' }])

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
    // The same card written down a second time under the detachment that shares it.
    { id: 'grim-reapers-plague-cohort', name: 'GRIM REAPERS', detachment_id: 'plague-cohort', cp_cost: 1, timing: 'once-per-phase' },
  ])
  write(path.join(core, 'detachments.json'), [
    {
      id: 'flyblown-host',
      name: 'Flyblown Host',
      enhancement_ids: ['living-plague', 'rejuvenating-swarm', 'virulent-carapace'],
      stratagem_ids: ['grim-reapers-plague-cohort', 'mortarions-teachings'],
      detachment_points: 2,
      force_dispositions: ['disruption'],
    },
    // Two detachments sharing one stratagem, written down once under the other.
    { id: 'plague-cohort', name: 'Plague Cohort', stratagem_ids: ['grim-reapers-flyblown-host'], detachment_points: 1 },
  ])
  write(path.join(core, 'enhancements.json'), [
    { id: 'living-plague', name: 'Living Plague', detachment_id: 'flyblown-host', cost: 20, keyword_restrictions: ['Character'] },
    { id: 'rejuvenating-swarm', name: 'Rejuvenating Swarm', detachment_id: 'flyblown-host', cost: 10 },
    { id: 'virulent-carapace', name: 'Virulent Carapace (Upgrade)', detachment_id: 'flyblown-host', cost: 15 },
  ])
  write(path.join(core, 'factions.json'), [
    {
      id: 'death-guard',
      name: 'Death Guard',
      aliases: ['Plague Marines'],
      faction_rule_id: 'oath-of-moment',
      logo_url: 'https://cdn.jsdelivr.net/example/death-guard.svg',
    },
    { id: 'orks', name: 'Orks', logo_url: 'https://cdn.jsdelivr.net/example/orks.svg' },
  ])
  const icons = path.join(directory, 'faction-icons')
  fs.mkdirSync(icons)
  fs.writeFileSync(path.join(icons, 'death-guard.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  write(path.join(root, 'stratagems.json'), [
    { id: 'command-re-roll', name: 'COMMAND RE-ROLL', cp_cost: 1, timing: 'once-per-battle' },
    { id: 'insane-bravery', name: 'INSANE BRAVERY', cp_cost: 1, timing: 'once-per-battle' },
  ])
  const datacards = path.join(directory, 'datacards', '11th', 'gdc')
  fs.mkdirSync(datacards, { recursive: true })
  write(path.join(datacards, 'deathguard.json'), {
    name: 'Death Guard',
    datasheets: [],
    detachments: [
      {
        name: { en: 'Flyblown Host' },
        detachmentPoints: 3,
        detachmentPointsOverrides: [{ faction: 'Death Guard', detachmentPoints: 1 }],
        forceDisposition: { name: { en: 'Take and Hold' } },
      },
    ],
    rules: {
      army: [{ name: { en: 'Oath of Moment' }, rules: [{ order: 1, type: 'text', text: { en: 'Re-roll Hit rolls.' } }] }],
      detachment: [
        {
          detachment: 'Flyblown Host',
          rules: [{ name: { en: 'Virulent Vectorium' }, rules: [{ order: 1, type: 'text', text: { en: 'Spread disease.' } }] }],
        },
      ],
    },
    enhancements: [
      { name: { en: 'Living Plague' }, detachment: 'Flyblown Host', cost: '25', description: { en: 'Spread the plague.' } },
      { name: { en: 'Rejuvenating Swarm' }, detachment: 'Flyblown Host', cost: '5', description: { en: 'Return models.' } },
      // The rules dataset spells the upgrade with its suffix; the cards may not.
      { name: { en: 'Virulent Carapace' }, detachment: 'Flyblown Host', cost: '30', description: { en: 'Improve the unit.' } },
    ],
    stratagems: [{ name: { en: 'Grim Reapers' }, detachment: 'Flyblown Host', effect: { en: 'Cut them down.' } }],
  })
  write(path.join(datacards, 'deathwatch.json'), {
    name: 'Deathwatch',
    datasheets: [],
    detachments: [],
    rules: {
      army: [
        {
          name: { en: 'Space Marine Chapters' },
          rules: [
            {
              order: 1,
              type: 'text',
              text: { en: 'Your army cannot include any of the following units: **SCOUT SQUAD**; **TACTICAL SQUAD**.' },
            },
          ],
        },
      ],
    },
  })
  write(path.join(datacards, 'spacemarines.json'), {
    name: 'Adeptus Astartes',
    datasheets: [],
    detachments: [
      {
        name: { en: 'Stormlance Task Force' },
        detachmentPoints: 3,
        detachmentPointsOverrides: [{ faction: 'Imperial Fists', detachmentPoints: 2 }],
        forceDisposition: { name: { en: 'Priority Assets' } },
      },
    ],
  })
  write(path.join(datacards, 'core.json'), {
    stratagems: [
      {
        name: { en: 'Command Re-roll' },
        type: 'Core Stratagem',
        fluff: { en: 'Bend fate to your will.' },
        when: { en: 'Any phase.' },
        target: { en: 'That unit or model.' },
        effect: { en: 'Re-roll that roll.' },
        restrictions: { en: 'One re-roll.' },
      },
    ],
  })
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
  write(path.join(root, 'missions.json'), [
    {
      id: 'death-trap',
      name: 'Death Trap',
      vp_per_round_cap: 15,
      vp_per_game_cap: 45,
      secondary_vp_per_round_cap: 15,
      secondary_vp_per_game_cap: 45,
    },
    {
      id: 'vital-link',
      name: 'Vital Link',
      vp_per_round_cap: 15,
      vp_per_game_cap: 45,
      secondary_vp_per_round_cap: 15,
      secondary_vp_per_game_cap: 45,
    },
  ])
  write(path.join(root, 'mission-matchups.json'), [
    { disposition: 'disruption', opponent_disposition: 'take-and-hold', mission_id: 'death-trap' },
    { disposition: 'take-and-hold', opponent_disposition: 'disruption', mission_id: 'vital-link' },
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

const load = () => loadRules(directory, undefined, path.join(directory, 'faction-icons'), path.join(directory, 'datacards', '11th', 'gdc'))!

describe('stratagems', () => {
  it('finds parent-faction detachment semantics in a declared child faction', () => {
    expect(hasDetachmentSemantics(load(), { faction: 'Adeptus Astartes', name: 'Stormlance Task Force' })).toBe(true)
  })

  it('does not find same-named detachment semantics in an unrelated faction', () => {
    expect(hasDetachmentSemantics(load(), { faction: 'Adeptus Astartes', name: 'Flyblown Host' })).toBe(false)
  })

  it('keeps descriptions that supplement datasheet abilities', () => {
    expect(load().abilityDescriptions.get('oath-of-moment')).toBe('Re-roll Hit rolls.')
  })

  it('keeps the player-facing faction name', () => {
    expect(load().factionNames.get('death-guard')).toBe('Death Guard')
  })

  it('reads faction restrictions from army rules', () => {
    expect(load().factionRestrictions.get('deathwatch')).toEqual({
      excludedNames: new Map([
        ['scout squad', null],
        ['tactical squad', null],
      ]),
      excludedKeywords: new Set(),
    })
  })

  it('keeps the local faction icon path', () => {
    expect(load().factionIcons.get('death-guard')).toMatch(/^data:image\/svg\+xml;base64,/)
  })

  it('uses a faction icon for its aliases', () => {
    expect(load().factionIcons.get('plague-marines')).toBe(load().factionIcons.get('death-guard'))
  })

  it('keeps the named army rule for the faction and its aliases', () => {
    expect(load().factionRules.get('plague-marines')).toEqual({ name: 'Oath of Moment', description: 'Re-roll Hit rolls.' })
  })

  it('uses the pinned upstream icon while an older snapshot has no local copy', () => {
    expect(load().factionIcons.get('orks')).toBe('https://cdn.jsdelivr.net/example/orks.svg')
  })

  it('keeps the reference metadata for each detachment', () => {
    expect(load().detachmentReferences.get('death-guard')?.get('flyblown-host')).toEqual({
      enhancements: 2,
      upgrades: 1,
      stratagems: 2,
      points: 1,
      dispositions: ['take-and-hold'],
    })
  })

  it('reads shared construction values from a declared parent faction', () => {
    expect(load().detachmentReferences.get('imperial-fists')?.get('stormlance-task-force')).toMatchObject({
      points: 2,
      dispositions: ['priority-assets'],
    })
  })

  it('keeps the detail needed by the detachment reference page', () => {
    expect(load().detachmentDetails.get('death-guard')?.get('flyblown-host')).toMatchObject({
      rules: [{ name: 'Virulent Vectorium', description: 'Spread disease.' }],
      enhancements: [
        { name: 'Living Plague', points: 25, description: 'Spread the plague.', keywordRestrictions: ['Character'] },
        { name: 'Rejuvenating Swarm', points: 5, description: 'Return models.' },
      ],
      upgrades: [{ name: 'Virulent Carapace', points: 30, description: 'Improve the unit.' }],
      stratagems: expect.arrayContaining([
        expect.objectContaining({ name: 'Grim Reapers', cp: 1, description: '**Effect:** Cut them down.' }),
      ]),
    })
  })

  it('are grouped under the detachment that brings them', () => {
    expect(load().byDetachment.get('death-guard')?.get('flyblown-host')).toHaveLength(2)
  })

  it('reach a detachment that names one the dataset filed under another', () => {
    // The shared six are written once and referenced by id from everywhere else, so
    // reading only the record's own detachment loses them.
    expect(
      load()
        .byDetachment.get('death-guard')
        ?.get('plague-cohort')
        ?.map((stratagem) => stratagem.name),
    ).toEqual(['Grim Reapers'])
    expect(
      load()
        .detachmentDetails.get('death-guard')
        ?.get('plague-cohort')
        ?.stratagems.map((found) => found.name),
    ).toEqual(['Grim Reapers'])
    expect(load().detachmentReferences.get('death-guard')?.get('plague-cohort')?.stratagems).toBe(1)
  })

  it('counts a card reached both ways once', () => {
    const found = load().byDetachment.get('death-guard')?.get('flyblown-host') ?? []
    expect(found.map((stratagem) => stratagem.name)).toEqual(['Grim Reapers', "Mortarion's Teachings"])
    // The copy filed under this detachment, not the one it merely names.
    expect(found[0]?.key).toBe('grim-reapers-flyblown-host')
  })

  it('answer to every name the dataset gives the faction', () => {
    // The catalogues call the Adeptus Astartes book Space Marines, and a whole
    // faction's detachment points and stratagems went missing over the difference.
    const rules = load()
    const key = rulesFaction(rules, 'plague-marines')
    expect(key).toBe('death-guard')
    expect(rules.detachmentReferences.get(key)?.get('flyblown-host')?.points).toBe(1)
    expect(rules.detachmentDetails.get(key)?.get('flyblown-host')?.name).toBe('Flyblown Host')
    expect(rules.byDetachment.get(key)?.get('flyblown-host')).toHaveLength(2)
  })

  it('are filed once, so counting them whole counts each faction once', () => {
    // Filing a faction under each of its names would have every reader that walks the
    // whole map see it twice, which is what the description ratchet caught.
    const rules = load()
    expect([...rules.detachmentDetails.keys()]).toEqual(['death-guard', 'imperial-fists'])
    expect(rulesFaction(rules, 'a-faction-nobody-has-heard-of')).toBe('a-faction-nobody-has-heard-of')
  })

  it('reports each missing construction join by its own kind', () => {
    expect(load().constructionJoinIssues).toEqual([{ kind: 'detachment', faction: 'Death Guard', detachment: 'Plague Cohort' }])
  })

  it('name the slug back when a stale rules object lacks the map', () => {
    // A memoized rules object built before the map existed keeps no factionKeys.
    // The reader must fall back to the slug rather than throw on the missing map.
    const stale = {} as ReturnType<typeof load>
    expect(rulesFaction(stale, 'death-guard')).toBe('death-guard')
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
    // Named as the card prints it where there is one; titled from the dataset's capitals where there is not.
    expect(load().core.map((stratagem) => stratagem.name)).toEqual(['Command Re-roll', 'Insane Bravery'])
  })

  it('read core descriptions from the verified Game Datacards path without filling upstream gaps', () => {
    expect(load().coreDetails).toEqual([
      {
        id: 'command-re-roll',
        type: 'Core Stratagem',
        description:
          'Bend fate to your will.\n\n**When:** Any phase.\n\n**Target:** That unit or model.\n\n**Effect:** Re-roll that roll.\n\n**Restrictions:** One re-roll.',
      },
    ])
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
  it('belongs to the army whose disposition comes first', () => {
    expect(missionFor(load(), 'take-and-hold', 'disruption')?.name).toBe('Vital Link')
  })

  it('carries the caps the mission itself states', () => {
    expect(missionFor(load(), 'disruption', 'take-and-hold')).toMatchObject({
      roundCap: 15,
      gameCap: 45,
      secondaryRoundCap: 15,
      secondaryGameCap: 45,
    })
  })

  /**
   * The ceiling is printed by the datacards pack and the mission is named by the rules
   * source, and the two are joined by the pack's name alone. They are separately
   * maintained community sources, so a rename on either side has to fail here rather
   * than silently stop enforcing the cap.
   */
  it('carries the per-card fixed ceiling its pack prints', () => {
    const root = path.join(directory, 'data', 'core')
    write(path.join(root, 'missions.json'), [{ id: 'pack-a-mission', name: 'Pack A Mission', source: 'Pack A' }])
    write(path.join(root, 'mission-matchups.json'), [
      { disposition: 'disruption', opponent_disposition: 'take-and-hold', mission_id: 'pack-a-mission' },
    ])
    const missions = path.join(directory, 'datacards', '11th', 'gdc', 'missions')
    fs.mkdirSync(missions, { recursive: true })
    write(path.join(missions, 'pack-a.json'), { name: { en: 'Pack A' }, fixedSecondaryMissionCapLimit: 20 })

    expect(missionFor(load(), 'disruption', 'take-and-hold', 'pack-a')?.fixedSecondaryCap).toBe(20)
  })

  it('states no per-card ceiling for a pack that prints none', () => {
    expect(missionFor(load(), 'disruption', 'take-and-hold')?.fixedSecondaryCap).toBeNull()
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
  it('resolves the current REST reference through the pinned catalog', () => {
    const id = 'terrain-01234567-89ab-cdef-0123-456789abcdef'
    const root = path.join(directory, 'data', 'core')
    write(path.join(root, 'terrain-layouts.json'), [
      {
        id: 'layout-a',
        name: 'Take vs Disrupt 01',
        mission_matchup_id: 'disruption-vs-take-and-hold',
        description: 'Imported from Battlemaster REST API layout superwutz/take-vs-disrupt-01.',
      },
    ])
    const battlemaster = path.join(directory, 'battlemaster')
    fs.mkdirSync(path.join(battlemaster, 'layouts'), { recursive: true })
    write(path.join(battlemaster, 'catalog.json'), {
      layouts: [{ id, owner: 'owner-id', ownerUsername: 'superwutz', name: 'Take vs Disrupt 01' }],
    })
    write(path.join(battlemaster, 'layouts', `${id}.json`), {
      layout: { id },
      terrain: [
        {
          name: 'Area',
          footprint: { origin: { x: 0, y: 0 }, widthIn: 10, heightIn: 10, rotationDeg: 0 },
          outline: { points: box(10, 10) },
          parts: [],
        },
      ],
    })

    expect(loadRules(directory, battlemaster)?.terrainLayouts[0]?.geometry?.areas).toHaveLength(1)
  })

  it('fails closed when a REST reference is ambiguous in the pinned catalog', () => {
    const first = 'terrain-01234567-89ab-cdef-0123-456789abcdef'
    const second = 'terrain-fedcba98-7654-3210-fedc-ba9876543210'
    const root = path.join(directory, 'data', 'core')
    write(path.join(root, 'terrain-layouts.json'), [
      {
        id: 'layout-a',
        name: 'Take vs Disrupt 01',
        mission_matchup_id: 'disruption-vs-take-and-hold',
        description: 'Imported from Battlemaster REST API layout superwutz/take-vs-disrupt-01.',
      },
    ])
    const battlemaster = path.join(directory, 'battlemaster')
    fs.mkdirSync(path.join(battlemaster, 'layouts'), { recursive: true })
    write(path.join(battlemaster, 'catalog.json'), {
      layouts: [
        { id: first, ownerUsername: 'superwutz', name: 'Take vs Disrupt 01' },
        { id: second, ownerUsername: 'superwutz', name: 'Take vs Disrupt 01' },
      ],
    })
    for (const id of [first, second]) {
      write(path.join(battlemaster, 'layouts', `${id}.json`), {
        layout: { id },
        terrain: [
          {
            name: 'Area',
            footprint: { origin: { x: 0, y: 0 }, widthIn: 10, heightIn: 10, rotationDeg: 0 },
            outline: { points: box(10, 10) },
            parts: [],
          },
        ],
      })
    }

    expect(loadRules(directory, battlemaster)?.terrainLayouts[0]?.geometry).toBeNull()
  })

  it('accepts the current detail identity used by the public API', () => {
    const id = 'terrain-01234567-89ab-cdef-0123-456789abcdef'
    const root = path.join(directory, 'data', 'core')
    write(path.join(root, 'terrain-layouts.json'), [
      {
        id: 'layout-a',
        name: 'Layout A',
        mission_matchup_id: 'disruption-vs-take-and-hold',
        description: `Imported from Battlemaster layout ${id}.`,
        pieces: [{ id: 'area-01', position: { x: 0, y: 0 }, is_objective: true, link_group: 'center' }],
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

    const rules = loadRules(directory, path.join(directory, 'battlemaster'))!

    expect(rules.terrainLayouts[0]?.geometry?.areas[0]).toMatchObject({
      id: 'area-1',
      markers: [{ label: 'AB', position: { x: 35, y: 17 } }],
      objectiveGroup: 'center',
    })
  })
})
