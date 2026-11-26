import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { calculateCombat, DEFAULT_COMBAT_OPTIONS, type CombatOptions, type CombatPhase } from '../src/core/combat'
import type { CombatAdjustments } from '../src/core/combatAdjustments'
import { combatMatchup, noExclusions, resolveCombatRequest, type CombatantSnapshot } from '../src/core/combatMatchup'
import { unquotedLabel } from '../src/core/combatReading'
import { combatRuleAppliesTo, combatRuleChoices, combatRuleSelections, type CombatRule } from '../src/core/combatRules'
import { combatAttacks } from '../src/core/combatScenario'
import { combatUnitKeywords, combatUnitTarget } from '../src/core/combatUnit'
import { buildUnit, type RosterPick } from '../src/core/roster'
import { combatantSnapshot } from '../src/shared/rosterGradeMeasures'
import { combatUnitsFor } from '../src/shared/combatUnits'
import { combatLoadoutCandidates, EXHAUSTIVE_STATES } from '../src/shared/combatLoadouts'
import { rosterCombatant } from '../src/shared/rosterCombatRules'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

describe.skipIf(!fs.existsSync(directory))('simulator catalogue projections', () => {
  let snapshot: ReturnType<typeof loadSnapshotWithRules>
  let index: ReturnType<typeof combatUnitsFor>

  // About 15 seconds alone, but CI runs it beside every other integration suite on a shared runner.
  beforeAll(() => {
    snapshot = loadSnapshotWithRules(directory)
    index = combatUnitsFor(snapshot.catalogue, snapshot.rules)
  }, 180_000)

  const unit = (faction: string, name: string) => {
    const book = index.find((candidate) => candidate.name === faction)!
    const entry = book.units.find((candidate) => candidate.name === name)!
    const projected = rosterCombatant(snapshot.catalogue, snapshot.rules, {
      catalogueId: book.catalogueId,
      detachmentIds: [],
      picks: [{ entryId: entry.id }],
      pickIndex: 0,
    })!
    return { sheet: projected.selected, carriers: projected.carriers, models: projected.models }
  }
  const attacks = (attacker: ReturnType<typeof unit>, preferences: Record<string, string> = {}) =>
    combatAttacks(attacker, { keywords: [], rules: [] }, preferences, { ranged: [], melee: [] })
  const damage = (attack: ReturnType<typeof attacks>[CombatOptions['phase']], phase: CombatOptions['phase']) =>
    calculateCombat({
      ...attack.base!,
      target: combatUnitTarget(unit('Space Marines', 'Intercessor Squad')).target!,
      options: { ...DEFAULT_COMBAT_OPTIONS, phase },
    }).meanDamage

  /** `from` names the faction whose book holds the unit, when another faction fields it. */
  type Member = {
    name: string
    from?: string
    models?: number
    attachedTo?: number
    spreads?: Record<string, Record<string, number>>
  }
  type Side = { snapshot: CombatantSnapshot; rules: CombatRule[] }
  /**
   * A roster's unit as the simulator fields it, with rules read from VS Data's facts. `rules` picks a rule's
   * option by its label, or `false` to turn it off; `spreads` name a choice and its options.
   */
  const side = (
    faction: string,
    members: readonly (string | Member)[],
    { detachment, pickIndex = 0, rules = {} }: { detachment?: string; pickIndex?: number; rules?: Record<string, string | false> } = {},
  ): Side => {
    const book = index.find((candidate) => candidate.name === faction)!
    const picks = members.map((member): RosterPick => {
      const { name, from, spreads, ...rest } = typeof member === 'string' ? { name: member } : member
      const home = from ? index.find((candidate) => candidate.name === from)! : book
      const entryId = home.units.find((candidate) => candidate.name === name)!.id
      const pick = from ? { ...rest, catalogueId: home.catalogueId } : rest
      if (!spreads) return { entryId, ...pick }
      const choices = buildUnit(entryId, snapshot.catalogue.index, pick.models, {}, { primaryCatalogueId: book.catalogueId })!.choices
      return {
        entryId,
        ...pick,
        spreads: Object.fromEntries(
          Object.entries(spreads).map(([choiceName, counts]) => {
            const choice = choices.find((candidate) => candidate.name === choiceName)!
            const option = (optionName: string) => choice.options.find((candidate) => candidate.name === optionName)!.id
            return [choice.key, Object.fromEntries(Object.entries(counts).map(([optionName, count]) => [option(optionName), count]))]
          }),
        ),
      }
    })
    const detachmentIds = detachment
      ? [snapshot.catalogue.detachments.get(book.catalogueId)!.options.find((option) => option.name === detachment)!.id]
      : []
    const projection = rosterCombatant(snapshot.catalogue, snapshot.rules, {
      catalogueId: book.catalogueId,
      detachmentIds,
      picks,
      pickIndex,
    })!
    const all = [...projection.rules, ...projection.companions.flatMap((member) => member.rules)]
    const selections = Object.fromEntries(
      Object.entries(rules).map(([name, label]) => {
        const rule = all.find((candidate) => candidate.name === name)!
        const at =
          label === false ? -1 : combatRuleChoices(rule).findIndex((choice) => unquotedLabel(choice.label, rule.description) === label)
        if (label !== false && at < 0) throw new Error(`${name} has no option ${label}`)
        return [rule.id, at + 1]
      }),
    )
    return { snapshot: combatantSnapshot(projection, combatRuleSelections(all, selections)), rules: all }
  }
  /** The rules a side's buff panel offers against the other side, by name. */
  const offered = (own: Side, opponent: Side, role: 'attacker' | 'defender') =>
    own.rules
      .filter((rule) => !rule.included && combatRuleAppliesTo(rule, role, combatUnitKeywords(opponent.snapshot)))
      .map((rule) => rule.name)
  const fight = (attacker: Side, defender: Side, adjustments: CombatAdjustments = {}, preferences: Record<string, string> = {}) => {
    const matchup = combatMatchup(attacker.snapshot, defender.snapshot, { preferences, excluded: noExclusions(), allocation: [] })
    const request = matchup.request(adjustments)
    const answer = resolveCombatRequest(request)
    const mean = (phase: CombatPhase) => answer[phase]!.result!.meanDamage
    return { matchup, request, answer, ranged: () => mean('ranged'), melee: () => mean('melee') }
  }

  const marines = () => side('Space Marines', ['Intercessor Squad'])
  const profiles = (plan: { active: readonly { profile: { name: string }; count: number }[] } | null) =>
    plan!.active.map(({ profile, count }) => [profile.name, count])

  it('Triarch Praetorians calculate particle caster and voidblade bundles in both phases', () => {
    const praetorians = side('Necrons', [{ name: 'Triarch Praetorians', spreads: { Weapons: { 'Particle caster and voidblade': 5 } } }])
    const { matchup, ranged, melee } = fight(praetorians, marines())
    expect({
      errors: [...matchup.plans.ranged!.errors, ...matchup.plans.melee!.errors],
      ranged: profiles(matchup.plans.ranged).map(([name]) => name),
      melee: profiles(matchup.plans.melee).map(([name]) => name),
      damage: ranged() > 0 && melee() > 0,
    }).toEqual({ errors: [], ranged: ['Particle caster'], melee: ['Voidblade'], damage: true })
  })

  it('Canoptek Wraiths shoot a particle caster with the Pistol keyword', () => {
    const wraiths = side('Necrons', [
      { name: 'Canoptek Wraiths', spreads: { '3-6 Wraiths': { 'Wraith w/ claws and particle caster': 1, 'Wraith w/ claws': 2 } } },
    ])
    const { matchup, ranged } = fight(wraiths, marines())
    expect({ errors: matchup.plans.ranged!.errors, damage: Number(ranged().toFixed(2)) }).toEqual({ errors: [], damage: 0.42 })
  })

  it('applies a named weapon ability alternative to the phase it names', () => {
    const jester = (choice: string | false) => fight(side('Aeldari', ['Death Jester'], { rules: { 'Cruel Amusement': choice } }), marines())
    const [off, on] = [jester(false), jester('SUSTAINED HITS 3')]
    expect({ ranged: on.ranged() > off.ranged(), melee: on.melee() === off.melee() }).toEqual({ ranged: true, melee: true })
  })

  it('Ammo Runts add to the Boyz’ shooting once activated', () => {
    const boyz = (choice: string | false) => side('Orks', ['Boyz'], { rules: { 'Ammo Runts (Once per battle, per unit)': choice } })
    expect(fight(boyz('Ability activated'), marines()).ranged()).toBeGreaterThan(fight(boyz(false), marines()).ranged())
  })

  it("Crushing Impact adds mortal wounds to a charging vehicle's fight", () => {
    const redeemer = (choice: string | false) =>
      side('Space Marines', ['Land Raider Redeemer'], { detachment: 'Gladius Task Force', rules: { 'Crushing Impact': choice } })
    expect(fight(redeemer('Charged this turn · Selected target within Engagement Range'), marines()).melee()).toBeGreaterThan(
      fight(redeemer(false), marines()).melee(),
    )
  })

  it('Relics of the Dark Age adds Strength to Sternguard shooting in Wrath of the Rock', () => {
    const sternguard = (choice: string | false) =>
      side('Dark Angels', [{ name: 'Sternguard Veteran Squad', from: 'Space Marines', models: 10 }], {
        detachment: 'Wrath of the Rock',
        rules: { 'Relics of the Dark Age': choice },
      })
    expect(fight(sternguard('Active'), marines()).ranged()).toBeGreaterThan(fight(sternguard(false), marines()).ranged())
  })

  it('a weapon beyond the set range makes no attacks', () => {
    const at = (distance: number) => fight(side('Space Marines', ['Land Raider Redeemer']), marines(), { ranged: { distance } }).ranged()
    expect(at(13)).toBeLessThan(at(12))
  })

  it('a Waaagh! protects defending Boyz', () => {
    const boyz = (choice: string | false) => side('Orks', ['Boyz'], { rules: { 'Waaagh!': choice } })
    expect(fight(marines(), boyz('This unit is riled up')).ranged()).toBeLessThan(fight(marines(), boyz(false)).ranged())
  })

  it('a Redemptor Dreadnought’s Duty Eternal blunts stronger attacks, though other units’ rules print its words', () => {
    const redemptor = (choice?: false) =>
      side('Space Marines', ['Redemptor Dreadnought'], choice === false ? { rules: { 'Duty Eternal': false } } : {})
    const landRaider = side('Space Marines', ['Land Raider'])
    expect(fight(landRaider, redemptor()).ranged()).toBeLessThan(fight(landRaider, redemptor(false)).ranged())
  })

  it('Prosecutors shrug off psychic attacks as Daughters of the Abyss, not as Aleya’s Daughter of the Abyss', () => {
    expect(combatUnitTarget(side('Adeptus Custodes', ['Prosecutor Squad']).snapshot, 'ranged').target?.psychicFeelNoPain).toBe(3)
  })

  it("gives Imperial Navy Breachers' Endurant shield invulnerable save only to the model holding it", () => {
    const groups = fight(marines(), side('Agents of the Imperium', ['Imperial Navy Breachers'])).request.ranged?.target.groups
    expect(groups?.map((group) => [group.models, group.invulnerable]).toSorted()).toEqual([
      [1, 4],
      [9, null],
    ])
  })

  it("re-rolls only the Sisters Repentia's attacks for Overseer of Redemption, not the Repentia Superior's", () => {
    const { request } = fight(side('Adepta Sororitas', ['Repentia Squad']), marines())
    const rerolls = request.melee!.weapons.map((weapon) => weapon.hitReroll ?? request.melee!.options.hitReroll ?? 'none')
    expect(rerolls.toSorted()).toEqual(['failed', 'none'])
  })

  it("keeps a Canoptek Reanimator's Feel No Pain 4+ among the defender's rules", () => {
    const rule = side('Necrons', ['Canoptek Reanimator']).rules.find((candidate) => candidate.name === 'Feel No Pain 4+')
    expect(rule && combatRuleAppliesTo(rule, 'defender')).toBe(true)
  })

  it('Deathshroud Manreaper modes count every carrier', () => {
    const [champion, terminator] = ['Deathshroud Terminator Champion · Manreaper', 'Deathshroud Terminator · Manreaper']
    const plan = (models: number, sweeping: readonly string[]) => {
      const attacker = side('Death Guard', [{ name: 'Deathshroud Terminators', models }])
      const choices = fight(attacker, marines()).matchup.plans.melee!.choices
      const sweep = (label: string) => {
        const choice = choices.find((candidate) => candidate.label === label)!
        return [choice.key, choice.options.find((option) => option.label === '➤ Manreaper - sweep')!.value]
      }
      return profiles(fight(attacker, marines(), {}, Object.fromEntries(sweeping.map(sweep))).matchup.plans.melee)
    }
    expect([plan(3, []), plan(3, [champion]), plan(3, [champion, terminator]), plan(4, [champion, terminator])]).toEqual([
      [['➤ Manreaper - strike', 3]],
      [
        ['➤ Manreaper - strike', 2],
        ['➤ Manreaper - sweep', 1],
      ],
      [['➤ Manreaper - sweep', 3]],
      [['➤ Manreaper - sweep', 4]],
    ])
  })

  it('Eradicators fire one melta rifle profile per model', () => {
    const attacker = side('Space Marines', ['Eradicator Squad with Melta Rifles'])
    expect(profiles(fight(attacker, marines()).matchup.plans.ranged)).toEqual([['➤ Melta Rifle', 3]])
  })

  it('Eradicators fire the Hunter profile at a vehicle', () => {
    const attacker = side('Space Marines', ['Eradicator Squad with Melta Rifles'])
    const rhino = side('Space Marines', ['Rhino'])
    expect(profiles(fight(attacker, rhino).matchup.plans.ranged)).toEqual([['➤ Melta Rifle HUNTER:Monster/Vehicle', 3]])
  })

  it('indirect fire costs less when spotted than when unobserved', () => {
    const crawler = side('Death Guard', ['Plagueburst Crawler'])
    const shot = (indirectFire: 'direct' | 'unobserved' | 'spotted') => fight(crawler, marines(), { ranged: { indirectFire } }).ranged()
    const spotted = shot('spotted')
    expect(shot('unobserved') < spotted && spotted < shot('direct')).toBe(true)
  })

  it('Black Templars field no retired Templar Vows', () => {
    const templars = side('Black Templars', ['Sword Brethren Squad'])
    expect(templars.rules.map((rule) => rule.name)).not.toContain('Templar Vows')
  })

  it.each([
    ['Rattlejoint Ague', { toughness: -1, save: 1 }],
    ['Scabrous Soulrot', { toughness: -1, save: 0 }],
    ['Skullsquirm Blight', { toughness: -1, save: 0 }],
  ])("Nurgle's Gift %s afflicts the defender", (plague, change) => {
    const defence = (choice: string | false) => {
      const [group] = fight(side('Death Guard', ['Plague Marines'], { rules: { "Nurgle's Gift (Aura)": choice } }), marines()).request
        .ranged!.target.groups
      return group!
    }
    const [healthy, afflicted] = [defence(false), defence(`Opponent afflicted · ${plague}`)]
    expect({ toughness: afflicted.toughness - healthy.toughness, save: afflicted.save - healthy.save }).toEqual(change)
  })

  it("a defending unit's Nurgle's Gift gives it cover", () => {
    const cover = (choice: string | false) =>
      fight(marines(), side('Death Guard', ['Plague Marines'], { rules: { "Nurgle's Gift (Aura)": choice } })).request.ranged!.options.cover
    expect([cover('Opponent afflicted · Skullsquirm Blight'), cover(false)]).toEqual([true, false])
  })

  it.each([
    ['Skorpekh Lord', 'Crimson Harvest', 'Charged this turn · Target in Engagement Range', 'melee'],
    ['Annihilation Barge', 'Malevolent Arcing', 'Active', 'ranged'],
  ] as const)('%s adds %s mortal wounds to its %s', (name, rule, label, phase) => {
    const attack = (choice: string | false) => fight(side('Necrons', [name], { rules: { [rule]: choice } }), marines())[phase]()
    expect(attack(label)).toBeGreaterThan(attack(false))
  })

  it('offers Matter Absorption only against a vehicle, where it adds mortal wounds', () => {
    const dragon = (choice?: string | false) =>
      side('Necrons', ["C'tan Shard of the Void Dragon"], choice === undefined ? {} : { rules: { 'Matter Absorption': choice } })
    const raider = side('Space Marines', ['Land Raider'])
    expect({
      infantry: offered(dragon(), marines(), 'attacker'),
      vehicle: offered(dragon(), raider, 'attacker'),
      absorbs: fight(dragon('Target within 12"'), raider).ranged() > fight(dragon(false), raider).ranged(),
    }).toEqual({ infantry: ['Crushing Impact'], vehicle: ['Matter Absorption', 'Crushing Impact'], absorbs: true })
  })

  it('offers Belial only the rules the simulator calculates, Grand Master of the Deathwing only against a Character', () => {
    const belial = side('Dark Angels', ['Belial'])
    const captain = side('Space Marines', ['Captain'])
    expect({
      attacker: offered(belial, marines(), 'attacker'),
      defender: offered(belial, marines(), 'defender'),
      character: offered(belial, captain, 'attacker'),
    }).toEqual({ attacker: [], defender: [], character: ['Grand Master of the Deathwing'] })
  })

  it('Immortals led by an Overlord calculate every phase against Deathshroud led by Typhus', () => {
    const { matchup, answer, request } = fight(
      side('Necrons', ['Immortals', { name: 'Overlord', attachedTo: 0 }]),
      side('Death Guard', ['Deathshroud Terminators', { name: 'Typhus', attachedTo: 0 }]),
    )
    expect({
      errors: [...matchup.plans.ranged!.errors, ...matchup.plans.melee!.errors, ...(matchup.target?.error ? [matchup.target.error] : [])],
      combined: answer.combined?.result !== undefined,
      typhus: request.ranged!.target.groups.find((group) => group.unit === 'Typhus')?.feelNoPainSources,
    }).toEqual({ errors: [], combined: true, typhus: [{ unit: 'Deathshroud Terminators', value: 4 }] })
  })

  describe('roster rules', () => {
    it('offers Invasion Fleet Hormagaunts only calculated rules, and Synapse adds to their melee within Synapse Range', () => {
      const gaunts = (choice?: string | false) =>
        side('Tyranids', ['Hormagaunts'], { detachment: 'Invasion Fleet', ...(choice === undefined ? {} : { rules: { Synapse: choice } }) })
      const warriors = side('Necrons', ['Necron Warriors'])
      expect({
        attacker: offered(gaunts(), warriors, 'attacker'),
        defender: offered(gaunts(), warriors, 'defender'),
        synapse: fight(gaunts('Within Synapse Range'), warriors).melee() > fight(gaunts(false), warriors).melee(),
      }).toEqual({ attacker: ['Synapse', 'Adrenal Surge'], defender: ['Rapid Regeneration'], synapse: true })
    })

    it("a Spiritseer's Spirit Mark gives Wraithguard Sustained Hits 1 in both phases, and only as attacker", () => {
      const raider = side('Space Marines', ['Land Raider'])
      const wraithguard = (choice?: string | false) =>
        side('Aeldari', ['Spiritseer', 'Wraithguard'], {
          detachment: 'Warhost',
          pickIndex: 1,
          ...(choice === undefined ? {} : { rules: { 'Spirit Mark (Psychic)': choice } }),
        })
      const [off, on] = [
        fight(wraithguard(false), raider),
        fight(wraithguard('Selected unit within 6" · Against the selected target'), raider),
      ]
      const spiritseer = side('Aeldari', ['Spiritseer', 'Wraithguard'], { detachment: 'Warhost' })
      expect({
        default: wraithguard().snapshot.rules?.some((rule) => rule.name === 'Spirit Mark (Psychic)'),
        ranged: on.ranged() > off.ranged(),
        melee: on.melee() > off.melee(),
        sustained: on.request.ranged!.weapons.map((weapon) => weapon.sustained),
        spiritseer: offered(spiritseer, raider, 'attacker').includes('Spirit Mark (Psychic)'),
        defender: offered(wraithguard(), raider, 'defender'),
      }).toEqual({ default: false, ranged: true, melee: true, sustained: [1], spiritseer: false, defender: [] })
    })

    it("Asurmen's Hand of Asuryan and Blitzing Firepower each add to his shooting", () => {
      const asurmen = (rules: Record<string, string | false>) =>
        fight(side('Aeldari', ['Asurmen'], { detachment: 'Warhost', rules }), marines())
      const off = asurmen({ 'Hand of Asuryan': false, 'Blitzing Firepower': false })
      const hand = asurmen({ 'Hand of Asuryan': 'Ability activated', 'Blitzing Firepower': false })
      const both = asurmen({ 'Hand of Asuryan': 'Ability activated', 'Blitzing Firepower': 'Target within 12"' })
      expect([hand.ranged() > off.ranged(), both.ranged() > hand.ranged()]).toEqual([true, true])
    })

    it('Gladius Intercessors ignore cover with Storm of devastation, and Armour of Contempt protects them only as defender', () => {
      const gladius = (rules: Record<string, string | false> = {}) =>
        side('Space Marines', ['Intercessor Squad'], { detachment: 'Gladius Task Force', rules })
      const storm = (choice: string | false) =>
        fight(gladius({ 'Storm of devastation': choice }), marines(), { ranged: { cover: true } }).ranged()
      const contempt = (choice: string | false) => fight(marines(), gladius({ 'Armour of Contempt': choice })).ranged()
      expect({
        open: Number(
          fight(gladius({ 'Storm of devastation': false }), marines())
            .ranged()
            .toFixed(2),
        ),
        storm: storm('Active') > storm(false),
        contempt: contempt('Active') < contempt(false),
        attacker: offered(gladius(), marines(), 'attacker').includes('Armour of Contempt'),
      }).toEqual({ open: 2.22, storm: true, contempt: true, attacker: false })
    })

    it("a Chronomancer's Solar Pulse needs the Chronomancer in the roster and lets Immortals ignore cover", () => {
      const immortals = (picks: string[], rules: Record<string, string | false> = {}) =>
        side('Necrons', picks, { detachment: 'Canoptek Court', rules })
      const pulse = (choice: string | false) =>
        fight(immortals(['Immortals', 'Chronomancer'], { 'Solar Pulse': choice }), marines(), { ranged: { cover: true } }).ranged()
      expect({
        alone: immortals(['Immortals']).rules.some((rule) => rule.name === 'Solar Pulse'),
        pulse: pulse('Condition the rule states') > pulse(false),
      }).toEqual({ alone: false, pulse: true })
    })
  })

  it.each([
    ['Blood Angels', 'Lemartes', 'ranged'],
    ['Chaos Daemons', 'Pink Horrors', 'ranged'],
    ['Astra Militarum', 'Cadian Heavy Weapons Squad', 'melee'],
    ['Aeldari', 'Jain Zar', 'melee'],
    ['Drukhari', 'Lady Malys', 'melee'],
    ['Orks', 'Deffkoptas', 'ranged'],
  ] as const)('%s %s calculates its %s source-linked equipment', (faction, name, phase) => {
    const attack = attacks(unit(faction, name))[phase]
    expect(attack.plan.errors).toEqual([])
    expect(damage(attack, phase)).toBeGreaterThan(0)
  })

  it('calculates the Avatar of Khaine’s Sustained Hits D3 shooting', () => {
    const attack = attacks(unit('Aeldari', 'Avatar of Khaine')).ranged
    expect({ errors: attack.plan.errors, damage: damage(attack, 'ranged') > 0 }).toEqual({ errors: [], damage: true })
  })

  it.each(['strike', 'sweep'])('Defiler calculates its Shearing claws %s profile', (mode) => {
    const defiler = unit('Death Guard', 'Defiler')
    const choice = attacks(defiler).melee.plan.choices.find((candidate) => candidate.label === 'Defiler · Shearing claws')!
    const option = choice.options.find((candidate) => candidate.label === `Shearing claws - ${mode}`)!
    const attack = attacks(defiler, { [choice.key]: option.value }).melee
    expect(attack.plan.active.map(({ profile }) => profile.name)).toEqual([`Shearing claws - ${mode}`])
    expect(damage(attack, 'melee')).toBeGreaterThan(0)
  })

  it.each([
    ['Death Guard', 'Plague Marines', 10, true],
    ['Orks', 'Boyz', 10, false],
  ] as const)('%s %s ×%i searches only near the requested loadout: %s', async (faction, name, models, local) => {
    const book = index.find((candidate) => candidate.name === faction)!
    const entry = book.units.find((candidate) => candidate.name === name)!
    const data = { catalogueId: book.catalogueId, detachmentIds: [], picks: [{ entryId: entry.id, models }], pickIndex: 0 }
    const batches = []
    for await (const batch of combatLoadoutCandidates(snapshot.catalogue, data, new AbortController().signal, snapshot.rules))
      batches.push(batch)
    expect({
      local: batches.every((batch) => batch.local),
      beyondBound: batches[0]!.estimated > EXHAUSTIVE_STATES,
    }).toEqual({ local, beyondBound: local })
  })

  describe('a Loyal Protector joined to a Command Squad leading Cadian Shock Troops', () => {
    const roster = () => {
      const book = index.find((candidate) => candidate.name === 'Astra Militarum')!
      const id = (name: string) => book.units.find((candidate) => candidate.name === name)!.id
      return {
        catalogueId: book.catalogueId,
        detachmentIds: [],
        picks: [
          { entryId: id('Cadian Shock Troops') },
          { entryId: id('Cadian Command Squad'), attachedTo: 0 },
          { entryId: id('Nork Deddog'), attachedTo: 1 },
        ],
      }
    }
    const members = (pickIndex: number) => {
      const projected = rosterCombatant(snapshot.catalogue, snapshot.rules, { ...roster(), pickIndex })!
      return [projected.selected, ...projected.companions.map((member) => member.selected)].map((sheet) => sheet.name).sort()
    }

    it.each([0, 2])('simulates all three from position %i as one unit', (pickIndex) => {
      expect(members(pickIndex)).toEqual(['Cadian Command Squad', 'Cadian Shock Troops', 'Nork Deddog'])
    })

    it('gives Feel No Pain 4+ to the Cadian Commander alone while Nork stands', () => {
      const projected = rosterCombatant(snapshot.catalogue, snapshot.rules, { ...roster(), pickIndex: 0 })!
      const groups = combatUnitTarget({
        sheet: projected.selected,
        carriers: projected.carriers,
        models: projected.models,
        companions: projected.companions.map((member) => ({ sheet: member.selected, carriers: member.carriers, models: member.models })),
      }).target!.groups
      expect(
        groups.flatMap((group) =>
          group.feelNoPainSources?.length ? [[group.unit, group.models, group.wounds, group.feelNoPainSources]] : [],
        ),
      ).toEqual([['Cadian Command Squad', 1, 3, [{ unit: 'Nork Deddog', value: 4 }]]])
    })

    it('counts Ogryn Bodyguard as calculated', () => {
      const projected = rosterCombatant(snapshot.catalogue, snapshot.rules, { ...roster(), pickIndex: 2 })!
      expect(projected.rules.find((rule) => rule.name === 'Ogryn Bodyguard')?.included).toBe(true)
    })
  })

  it.each([
    ['Intercessor Squad', ['Space Marines']],
    ['Assault Intercessor Squad', ['Space Marines']],
    ['Impulsor', ['Black Templars', 'Space Marines']],
  ])('lists %s only in its distinct faction contexts', (name, factions) => {
    expect(
      index
        .filter((book) => book.units.some((entry) => entry.name === name))
        .map((book) => book.name)
        .sort(),
    ).toEqual(factions)
  })
})
