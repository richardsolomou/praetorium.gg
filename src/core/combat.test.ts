import { describe, expect, it } from 'vitest'
import { attackSequence, diceExpression, simulateCombat, woundTarget, type CombatInput } from './combat'

const input = (): CombatInput => ({
  target: { models: 5, toughness: 4, save: 7, invulnerable: null, wounds: 2, feelNoPain: null },
  weapons: [
    {
      count: 1,
      attacks: { dice: 0, sides: 6, bonus: 1 },
      skill: 3,
      strength: 4,
      ap: 0,
      damage: { dice: 0, sides: 6, bonus: 3 },
      torrent: false,
      lethal: false,
      sustained: 0,
      devastating: false,
      criticalWound: 6,
      twinLinked: false,
      ignoresCover: false,
      psychic: false,
      blast: 0,
      rapidFire: 0,
      melta: 0,
      heavy: false,
      lance: false,
    },
  ],
  options: {
    phase: 'ranged',
    cover: false,
    halfRange: false,
    heavy: false,
    charged: false,
    hitModifier: 0,
    woundModifier: 0,
    hitReroll: 'none',
    woundReroll: 'none',
    lethal: true,
  },
})

function rolls(...values: number[]) {
  let at = 0
  return () => {
    const value = values[at++]
    if (value === undefined) throw new Error('Unexpected dice roll')
    return (value - 0.5) / 6
  }
}

describe('combat', () => {
  describe('indirect shooting', () => {
    const indirect = () => {
      const scenario = input()
      Object.assign(scenario.weapons[0]!, { indirectFire: true, damage: { dice: 0, sides: 6, bonus: 1 } })
      return scenario
    }
    it.each(['unobserved', 'spotted'] as const)(
      'enforces the unmodified hit floor for %s fire before critical hits and modifiers',
      (mode) => {
        const scenario = indirect()
        scenario.options.indirectFire = mode
        scenario.options.hitModifier = 1
        Object.assign(scenario.weapons[0]!, { skill: 2, criticalHit: 2 })
        expect([1, 2, 3, 4, 5, 6].map((hit) => attackSequence(scenario, rolls(hit, 6, 1)).damage)).toEqual(
          mode === 'spotted' ? [0, 0, 0, 1, 1, 1] : [0, 0, 0, 0, 0, 1],
        )
      },
    )
    it.each(['options', 'weapon'] as const)('disables hit rerolls granted by %s', (source) => {
      const scenario = indirect()
      scenario.options.indirectFire = 'spotted'
      if (source === 'options') scenario.options.hitReroll = 'failed'
      else scenario.weapons[0]!.hitReroll = 'failed'
      expect(attackSequence(scenario, rolls(1)).damage).toBe(0)
    })
    it('applies cover as well as the minimum unmodified hit roll', () => {
      const scenario = indirect()
      scenario.options.indirectFire = 'spotted'
      scenario.weapons[0]!.skill = 4
      expect(attackSequence(scenario, rolls(4)).damage).toBe(0)
    })
    it.each(['ignoresCover', 'psychic'] as const)('honours %s when resolving indirect cover', (ability) => {
      const scenario = indirect()
      scenario.options.indirectFire = 'spotted'
      Object.assign(scenario.weapons[0]!, { skill: 4, [ability]: true })
      expect(attackSequence(scenario, rolls(4, 6, 1)).damage).toBe(1)
    })
    it('does not let psychic attacks ignore the unmodified hit floor', () => {
      const scenario = indirect()
      scenario.options.indirectFire = 'unobserved'
      Object.assign(scenario.weapons[0]!, { psychic: true, criticalHit: 4, ignoreHitModifiers: true })
      expect(attackSequence(scenario, rolls(5)).damage).toBe(0)
    })
    it('keeps ordinary weapons direct and allows their hit rerolls', () => {
      const scenario = indirect()
      scenario.options.indirectFire = 'unobserved'
      scenario.options.hitReroll = 'failed'
      scenario.weapons[0]!.indirectFire = false
      expect(attackSequence(scenario, rolls(1, 3, 6, 1)).damage).toBe(1)
    })
    it('allows an indirect-capable weapon to fire directly', () => {
      const scenario = indirect()
      scenario.options.indirectFire = 'direct'
      expect(attackSequence(scenario, rolls(3, 6, 1)).damage).toBe(1)
    })
    it('does not apply shooting restrictions to melee', () => {
      const scenario = indirect()
      Object.assign(scenario.options, { phase: 'melee', indirectFire: 'unobserved' })
      expect(attackSequence(scenario, rolls(3, 6, 1)).damage).toBe(1)
    })
  })

  it('rolls Sustained Hits separately for every critical hit without making extra hits lethal', () => {
    const scenario = input()
    Object.assign(scenario.target, { models: 10, wounds: 1 })
    Object.assign(scenario.weapons[0]!, {
      attacks: { dice: 0, sides: 6, bonus: 2 },
      lethal: true,
      sustained: { dice: 1, sides: 3, bonus: 0 },
      damage: { dice: 0, sides: 6, bonus: 1 },
    })
    expect(attackSequence(scenario, rolls(6, 1, 1, 4, 1, 6, 1, 6, 1, 4, 1, 4, 1))).toEqual({ damage: 5, killed: 5 })
  })
  it('does not roll variable Sustained Hits on a normal hit', () => {
    const scenario = input()
    scenario.weapons[0]!.sustained = { dice: 1, sides: 3, bonus: 0 }
    expect(attackSequence(scenario, rolls(3, 4, 1)).damage).toBe(2)
  })
  it.each([false, true])('rolls Rapid Fire per weapon only at half range (%s)', (halfRange) => {
    const scenario = input()
    scenario.options.halfRange = halfRange
    Object.assign(scenario.weapons[0]!, { rapidFire: { dice: 1, sides: 3, bonus: 0 }, torrent: true })
    expect(attackSequence(scenario, rolls(...(halfRange ? [1] : []), 4, 1, ...(halfRange ? [4, 1] : []))).killed).toBe(halfRange ? 2 : 1)
  })
  it('counts Cleave attacks from the original target size throughout the attack sequence', () => {
    const scenario = input()
    Object.assign(scenario.target, { models: 5, wounds: 1 })
    Object.assign(scenario.weapons[0]!, { count: 2, cleave: 1, torrent: true })
    expect(attackSequence(scenario, rolls(4, 1, 4, 1, 4, 1, 4, 1)).killed).toBe(4)
  })
  it('bounds work using maximum variable extra hits', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, {
      count: 100,
      attacks: { dice: 0, sides: 6, bonus: 10 },
      sustained: { dice: 10, sides: 6, bonus: 100 },
    })
    expect(() => simulateCombat(scenario)).toThrow('too large')
  })
  it('rerolls a damage roll of one once before applying prevention', () => {
    const scenario = input()
    scenario.weapons[0]!.damage = { dice: 1, sides: 6, bonus: 0 }
    scenario.weapons[0]!.damageReroll = 'ones'
    scenario.target.wounds = 8
    scenario.target.damageReduction = 1
    expect(attackSequence(scenario, rolls(3, 4, 1, 1, 4))).toEqual({ damage: 3, killed: 0 })
  })
  it('keeps a second damage roll of one', () => {
    const scenario = input()
    scenario.weapons[0]!.damage = { dice: 1, sides: 6, bonus: 0 }
    scenario.weapons[0]!.damageReroll = 'ones'
    expect(attackSequence(scenario, rolls(3, 4, 1, 1, 1))).toEqual({ damage: 1, killed: 0 })
  })
  it('spills separate mortal wounds across models before ordinary attacks', () => {
    const scenario = input()
    scenario.mortalWounds = [{ timing: 'before', rolls: 1, outcomes: [{ min: 2, max: 6, damage: { dice: 0, sides: 6, bonus: 3 } }] }]
    expect(attackSequence(scenario, rolls(2, 3, 4, 1))).toEqual({ damage: 4, killed: 2 })
  })
  it('resolves after-attack mortal wounds after discarding normal overkill', () => {
    const scenario = input()
    scenario.mortalWounds = [{ timing: 'after', rolls: 1, outcomes: [{ min: 2, max: 6, damage: { dice: 0, sides: 6, bonus: 3 } }] }]
    expect(attackSequence(scenario, rolls(3, 4, 1, 2))).toEqual({ damage: 5, killed: 2 })
  })
  it('does not apply saves or damage reduction to separate mortal wounds', () => {
    const scenario = input()
    scenario.weapons = []
    Object.assign(scenario.target, { invulnerable: 2, damageReduction: 2, damageDivisor: 2 })
    scenario.mortalWounds = [{ timing: 'before', rolls: 1, outcomes: [{ min: 2, max: 6, damage: { dice: 0, sides: 6, bonus: 3 } }] }]
    expect(attackSequence(scenario, rolls(2))).toEqual({ damage: 3, killed: 1 })
  })
  it('uses mortal-only FNP on separate mortal wounds', () => {
    const scenario = input()
    scenario.weapons = []
    scenario.target.mortalFeelNoPain = 4
    scenario.mortalWounds = [{ timing: 'before', rolls: 1, outcomes: [{ min: 2, max: 6, damage: { dice: 0, sides: 6, bonus: 3 } }] }]
    expect(attackSequence(scenario, rolls(2, 3, 4, 5))).toEqual({ damage: 1, killed: 0 })
  })
  it('keeps mortal-only FNP out of normal weapon damage', () => {
    const scenario = input()
    scenario.target.mortalFeelNoPain = 2
    expect(attackSequence(scenario, rolls(3, 4, 1))).toEqual({ damage: 2, killed: 1 })
  })
  it('uses mortal-only FNP on devastating wounds without spilling over', () => {
    const scenario = input()
    scenario.target.mortalFeelNoPain = 4
    scenario.weapons[0]!.devastating = true
    expect(attackSequence(scenario, rolls(3, 6, 3, 3, 3))).toEqual({ damage: 2, killed: 1 })
  })
  it('matches the independent mean for an activated 2+ D3 mortal ability', () => {
    const scenario = input()
    scenario.weapons = []
    scenario.mortalWounds = [{ timing: 'before', rolls: 1, outcomes: [{ min: 2, max: 6, damage: { dice: 1, sides: 3, bonus: 0 } }] }]
    expect(simulateCombat(scenario).meanDamage).toBeCloseTo(5 / 3, 1)
  })
  it('rejects overlapping mortal-wound outcomes', () => {
    const scenario = input()
    scenario.mortalWounds = [
      {
        timing: 'before',
        rolls: 1,
        outcomes: [
          { min: 2, max: 5, damage: { dice: 0, sides: 6, bonus: 1 } },
          { min: 5, max: 6, damage: { dice: 0, sides: 6, bonus: 2 } },
        ],
      },
    ]
    expect(() => simulateCombat(scenario)).toThrow()
  })
  it('bounds mortal-wound simulation work', () => {
    const scenario = input()
    scenario.target.feelNoPain = 5
    scenario.mortalWounds = [{ timing: 'before', rolls: 100, outcomes: [{ min: 1, max: 6, damage: { dice: 10, sides: 6, bonus: 100 } }] }]
    expect(() => simulateCombat(scenario)).toThrow('too large')
  })
  it('psychic attacks ignore a worsened ballistic skill', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { psychic: true, skill: 4, baseSkill: 3 })
    expect(attackSequence(scenario, rolls(3, 4, 1)).damage).toBe(2)
  })
  it('psychic melee attacks still use their modified weapon skill', () => {
    const scenario = input()
    scenario.options.phase = 'melee'
    Object.assign(scenario.weapons[0]!, { psychic: true, skill: 4, baseSkill: 3 })
    expect(attackSequence(scenario, rolls(3)).damage).toBe(0)
  })
  it('preserves automatic Anti wounds alongside a lower successful critical threshold', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { strength: 1, criticalWound: 5, successfulCriticalWound: 4, devastating: true })
    scenario.target.invulnerable = 2
    expect(attackSequence(scenario, rolls(3, 5)).damage).toBe(2)
  })
  it('ignores negative hit modifiers while retaining a separate positive modifier', () => {
    const scenario = input()
    Object.assign(scenario.options, { hitModifier: 0, psychicHitModifier: 1 })
    Object.assign(scenario.weapons[0]!, { ignoreHitModifiers: true })
    expect(attackSequence(scenario, rolls(2, 4, 1)).damage).toBe(2)
  })
  it('ignores negative wound modifiers while retaining a separate positive modifier', () => {
    const scenario = input()
    Object.assign(scenario.options, { woundModifier: 0, positiveWoundModifier: 1 })
    Object.assign(scenario.weapons[0]!, { ignoreWoundModifiers: true })
    expect(attackSequence(scenario, rolls(3, 3, 1)).damage).toBe(2)
  })
  it('ignores worsening skill and cover together', () => {
    const scenario = input()
    scenario.options.cover = true
    Object.assign(scenario.weapons[0]!, { skill: 5, baseSkill: 3, ignoreSkillModifiers: true })
    expect(attackSequence(scenario, rolls(3, 4, 1)).damage).toBe(2)
  })
  it('does not worsen an improved skill when ignoring modifiers', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { skill: 2, baseSkill: 3, ignoreSkillModifiers: true })
    expect(attackSequence(scenario, rolls(2, 4, 1)).damage).toBe(2)
  })
  it('does not turn a failed five into a successful-only critical hit', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { skill: 6, successfulCriticalHit: 5, lethal: true })
    expect(attackSequence(scenario, rolls(5)).damage).toBe(0)
  })
  it('an unconditional critical threshold makes a five hit automatically', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { skill: 6, criticalHit: 5, lethal: true })
    expect(attackSequence(scenario, rolls(5, 2)).killed).toBe(1)
  })
  it('rerolls failed fives before assigning successful-only critical hits', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { skill: 6, successfulCriticalHit: 5, lethal: true, hitReroll: 'failed' })
    expect(attackSequence(scenario, rolls(5, 6, 2)).killed).toBe(1)
  })
  it('does not turn a failed five into a successful-only critical wound', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { strength: 1, criticalWound: 6, successfulCriticalWound: 5, devastating: true })
    expect(attackSequence(scenario, rolls(3, 5)).damage).toBe(0)
  })
  it('keeps automatic lethal wounds from becoming critical wounds', () => {
    const scenario = input()
    scenario.target.save = 2
    Object.assign(scenario.weapons[0]!, { lethal: true, criticalWound: 6, successfulCriticalWound: 5, devastating: true })
    expect(attackSequence(scenario, rolls(6, 2)).damage).toBe(0)
  })
  it('all successful hits being critical does not apply to Torrent', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { torrent: true, allHitsCritical: true, lethal: true })
    expect(attackSequence(scenario, rolls(1)).damage).toBe(0)
  })
  it('halves damage before reduction and rounds up before prevention', () => {
    const scenario = input()
    Object.assign(scenario.target, { wounds: 10, damageDivisor: 2, damageReduction: 1, feelNoPain: 5 })
    scenario.weapons[0]!.damage.bonus = 7
    expect(attackSequence(scenario, rolls(3, 4, 2, 5, 4, 4)).damage).toBe(2)
  })
  it.each([
    [4, 1],
    [5, 0],
  ])('strength %i applies the stronger-attack penalty only when needed', (strength, damage) => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { strength, strongerWoundModifier: -1, damage: { dice: 0, sides: 6, bonus: 1 } })
    expect(attackSequence(scenario, rolls(3, strength === 4 ? 4 : 3, ...(damage ? [1] : []))).damage).toBe(damage)
  })
  it.each([
    [3, 4, 1],
    [4, 3, 1],
    [5, 2, 0],
  ])('applies a not-stronger wound bonus for Strength %i', (strength, wound, damage) => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { strength, notStrongerWoundModifier: 1, damage: { dice: 0, sides: 6, bonus: 1 } })
    expect(attackSequence(scenario, rolls(3, wound, ...(damage ? [1] : []))).damage).toBe(damage)
  })
  it.each([
    [4, 0],
    [6, 2],
  ])('a wound roll of %i applies critical AP only to a critical wound', (wound, damage) => {
    const scenario = input()
    scenario.target.save = 3
    scenario.weapons[0]!.criticalAp = -1
    expect(attackSequence(scenario, rolls(3, wound, 3)).damage).toBe(damage)
  })
  it('combines scoped and global hit modifiers before capping', () => {
    const scenario = input()
    scenario.options.hitModifier = 2
    scenario.weapons[0]!.hitModifier = -1
    expect(attackSequence(scenario, rolls(2, 4, 1)).killed).toBe(1)
  })
  it('starts damage allocation on the already wounded model without spilling', () => {
    const scenario = input()
    scenario.target.damage = 1
    scenario.weapons[0]!.attacks.bonus = 2
    expect(attackSequence(scenario, rolls(3, 4, 2, 3, 4, 2))).toEqual({ damage: 3, killed: 2 })
  })
  it('bounds the damage distribution by remaining wounds', () => {
    const scenario = input()
    scenario.target.models = 1
    scenario.target.damage = 1
    expect(simulateCombat(scenario).damage).toHaveLength(2)
  })
  it('rejects a front model with no wounds remaining', () => {
    const scenario = input()
    scenario.target.damage = 2
    expect(() => simulateCombat(scenario)).toThrow('at least one wound')
  })
  it('reduces each damage packet before damage prevention', () => {
    const scenario = input()
    scenario.target.damageReduction = 2
    scenario.target.feelNoPain = 5
    expect(attackSequence(scenario, rolls(3, 4, 2, 4))).toEqual({ damage: 1, killed: 0 })
  })
  it('damage reduction cannot reduce a positive packet below one', () => {
    const scenario = input()
    scenario.target.damageReduction = 5
    expect(attackSequence(scenario, rolls(3, 4, 2))).toEqual({ damage: 1, killed: 0 })
  })
  it('damage reduction does not turn zero damage into a wound', () => {
    const scenario = input()
    scenario.target.damageReduction = 1
    scenario.weapons[0]!.damage.bonus = 0
    expect(attackSequence(scenario, rolls(3, 4, 2))).toEqual({ damage: 0, killed: 0 })
  })
  it.each([
    ['2D6+3', { dice: 2, sides: 6, bonus: 3 }],
    ['D3', { dice: 1, sides: 3, bonus: 0 }],
    ['4', { dice: 0, sides: 6, bonus: 4 }],
    ['2D6+oops', null],
    ['999D6', null],
    ['*', null],
    ['-1', null],
  ])('parses the complete dice expression %s', (value, expected) => expect(diceExpression(value)).toEqual(expected))
  it.each([
    [8, 4, 2],
    [5, 4, 3],
    [4, 4, 4],
    [3, 4, 5],
    [2, 4, 6],
  ])('strength %i against toughness %i needs %i', (strength, toughness, result) => expect(woundTarget(strength, toughness)).toBe(result))
  it('discards damage beyond the wounds remaining on one model', () => {
    expect(attackSequence(input(), rolls(3, 4, 2))).toEqual({ damage: 2, killed: 1 })
  })
  it('allocates the next attack to the already wounded model', () => {
    const scenario = input()
    scenario.weapons[0]!.attacks.bonus = 3
    scenario.weapons[0]!.damage.bonus = 1
    expect(attackSequence(scenario, rolls(3, 4, 2, 3, 4, 2, 3, 4, 2))).toEqual({ damage: 3, killed: 1 })
  })
  it('uses an invulnerable save when AP defeats armour', () => {
    const scenario = input()
    scenario.target.invulnerable = 4
    scenario.weapons[0]!.ap = -4
    expect(attackSequence(scenario, rolls(3, 4, 4)).damage).toBe(0)
  })
  it('cover worsens ballistic skill rather than improving armour', () => {
    const scenario = input()
    scenario.options.cover = true
    expect(attackSequence(scenario, rolls(3)).damage).toBe(0)
  })
  it('cover does not affect melee attacks', () => {
    const scenario = input()
    scenario.options.cover = true
    scenario.options.phase = 'melee'
    expect(attackSequence(scenario, rolls(3, 4, 2)).killed).toBe(1)
  })
  it('ignores cover for a weapon that says so', () => {
    const scenario = input()
    scenario.options.cover = true
    scenario.weapons[0]!.ignoresCover = true
    expect(attackSequence(scenario, rolls(3, 4, 2)).killed).toBe(1)
  })
  it('a torrent hit cannot trigger lethal or sustained hits', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { torrent: true, lethal: true, sustained: 2 })
    expect(attackSequence(scenario, rolls(1)).damage).toBe(0)
  })
  it('extra sustained hits still roll to wound when the original hit is lethal', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { lethal: true, sustained: 1 })
    expect(attackSequence(scenario, rolls(6, 2, 1)).killed).toBe(1)
  })
  it('anti critical wounds bypass saves through devastating wounds', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { devastating: true, criticalWound: 4 })
    scenario.target.invulnerable = 2
    expect(attackSequence(scenario, rolls(3, 4)).killed).toBe(1)
  })
  it('a lethal hit is not a critical wound', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { devastating: true, lethal: true })
    scenario.target.invulnerable = 2
    expect(attackSequence(scenario, rolls(6, 2)).damage).toBe(0)
  })
  it('can decline lethal hits to attempt a critical wound', () => {
    const scenario = input()
    scenario.options.lethal = false
    Object.assign(scenario.weapons[0]!, { devastating: true, lethal: true })
    expect(attackSequence(scenario, rolls(6, 6)).killed).toBe(1)
  })
  it('re-rolls a failed wound once for twin-linked', () => {
    const scenario = input()
    scenario.weapons[0]!.twinLinked = true
    expect(attackSequence(scenario, rolls(3, 1, 4, 2)).killed).toBe(1)
  })
  it('an unmodified one still misses with a positive modifier', () => {
    const scenario = input()
    scenario.options.hitModifier = 1
    expect(attackSequence(scenario, rolls(1)).damage).toBe(0)
  })
  it('an unmodified six still hits with a negative modifier', () => {
    const scenario = input()
    scenario.weapons[0]!.skill = 6
    scenario.options.hitModifier = -1
    expect(attackSequence(scenario, rolls(6, 4, 2)).killed).toBe(1)
  })
  it('caps the combined heavy and hit roll bonus at plus one', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { skill: 4, heavy: true })
    Object.assign(scenario.options, { hitModifier: 1, heavy: true })
    expect(attackSequence(scenario, rolls(2)).damage).toBe(0)
  })
  it('caps stacked penalties only after including a weapon’s Heavy bonus', () => {
    const scenario = input()
    scenario.weapons[0]!.heavy = true
    Object.assign(scenario.options, { hitModifier: -2, heavy: true })
    expect(attackSequence(scenario, rolls(3)).damage).toBe(0)
  })
  it('keeps beneficial Psychic modifiers when ignoring a separate penalty', () => {
    const scenario = input()
    scenario.weapons[0]!.psychic = true
    Object.assign(scenario.options, { hitModifier: 0, psychicHitModifier: 1 })
    expect(attackSequence(scenario, rolls(2, 4, 2)).killed).toBe(1)
  })
  it('applies cover separately from the hit modifier', () => {
    const scenario = input()
    Object.assign(scenario.options, { cover: true, hitModifier: -1 })
    expect(attackSequence(scenario, rolls(4)).damage).toBe(0)
  })
  it('psychic ignores detrimental modifiers while keeping heavy', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { psychic: true, heavy: true })
    Object.assign(scenario.options, { cover: true, hitModifier: -1, heavy: true })
    expect(attackSequence(scenario, rolls(2, 4, 2)).killed).toBe(1)
  })
  it('rapid fire adds attacks for each weapon at half range', () => {
    const scenario = input()
    scenario.options.halfRange = true
    scenario.weapons[0]!.rapidFire = 1
    expect(attackSequence(scenario, rolls(3, 4, 2, 3, 4, 2)).killed).toBe(2)
  })
  it('rapid fire adds no attacks beyond half range', () => {
    const scenario = input()
    scenario.weapons[0]!.rapidFire = 1
    expect(attackSequence(scenario, rolls(3, 4, 2)).killed).toBe(1)
  })
  it('blast counts the target models before any weapons attack', () => {
    const scenario = input()
    scenario.weapons[0]!.count = 2
    scenario.weapons[0]!.blast = 1
    expect(attackSequence(scenario, rolls(3, 4, 2, 3, 4, 2, 3, 4, 2, 3, 4, 2)).killed).toBe(4)
  })
  it('melta adds damage at half range', () => {
    const scenario = input()
    scenario.weapons[0]!.damage.bonus = 1
    scenario.weapons[0]!.melta = 2
    scenario.options.halfRange = true
    expect(attackSequence(scenario, rolls(3, 4, 2)).killed).toBe(1)
  })
  it('melta adds no damage beyond half range', () => {
    const scenario = input()
    scenario.weapons[0]!.damage.bonus = 1
    scenario.weapons[0]!.melta = 2
    expect(attackSequence(scenario, rolls(3, 4, 2)).killed).toBe(0)
  })
  it('lance improves the wound roll after a charge in melee', () => {
    const scenario = input()
    Object.assign(scenario.options, { phase: 'melee', charged: true })
    scenario.weapons[0]!.lance = true
    expect(attackSequence(scenario, rolls(3, 3, 2)).killed).toBe(1)
  })
  it('lance does not improve the wound roll without a charge', () => {
    const scenario = input()
    scenario.options.phase = 'melee'
    scenario.weapons[0]!.lance = true
    expect(attackSequence(scenario, rolls(3, 3)).damage).toBe(0)
  })
  it('rolls random attacks once per equipped weapon', () => {
    const scenario = input()
    Object.assign(scenario.weapons[0]!, { count: 2, attacks: { dice: 1, sides: 3, bonus: 0 } })
    expect(attackSequence(scenario, rolls(1, 3, 4, 2, 3, 3, 4, 2, 3, 4, 2)).killed).toBe(3)
  })
  it('rolls random damage for each unsaved attack', () => {
    const scenario = input()
    scenario.weapons[0]!.damage = { dice: 1, sides: 6, bonus: 1 }
    expect(attackSequence(scenario, rolls(3, 4, 2, 1)).killed).toBe(1)
  })
  it('does not re-roll an already re-rolled hit', () => {
    const scenario = input()
    scenario.options.hitReroll = 'failed'
    expect(attackSequence(scenario, rolls(1, 1)).damage).toBe(0)
  })
  it('rolls Feel No Pain for each point of damage before discarding excess', () => {
    const scenario = input()
    scenario.target.feelNoPain = 5
    expect(attackSequence(scenario, rolls(3, 4, 2, 5, 5, 1))).toEqual({ damage: 1, killed: 0 })
  })
  it('does not spill devastating wounds onto another model', () => {
    const scenario = input()
    scenario.weapons[0]!.devastating = true
    expect(attackSequence(scenario, rolls(3, 6))).toEqual({ damage: 2, killed: 1 })
  })
  it('caps wounds lost at the target size', () => {
    const scenario = input()
    scenario.target.models = 1
    scenario.weapons[0]!.attacks.bonus = 2
    expect(attackSequence(scenario, rolls(3, 4, 2))).toEqual({ damage: 2, killed: 1 })
  })
  it('estimates an independently calculated one-attack kill probability', () => {
    const result = simulateCombat(input())
    expect(result.kills[1]).toBeCloseTo((4 / 6) * (3 / 6), 2)
  })
  it('returns a normalized distribution and repeats the same scenario exactly', () => {
    const result = simulateCombat(input())
    expect([result.kills.reduce((a, b) => a + b, 0), simulateCombat(input())]).toEqual([1, result])
  })
  it('rejects unbounded simulation work', () => {
    const scenario = input()
    scenario.weapons[0]!.count = 1000000
    expect(() => simulateCombat(scenario)).toThrow()
  })
  it('rejects an excessive combined workload even when each characteristic is valid', () => {
    const scenario = input()
    scenario.weapons[0]!.count = 100
    scenario.weapons[0]!.attacks.bonus = 100
    expect(() => simulateCombat(scenario)).toThrow('This attack is too large to simulate.')
  })
})

describe('Psychic damage prevention', () => {
  it('prevents only Psychic wounds when the conditional buff is active', () => {
    const scenario = input()
    scenario.weapons[0]!.psychic = true
    scenario.target.psychicFeelNoPain = 5
    expect(attackSequence(scenario, rolls(3, 4, 2, 5, 6, 3))).toEqual({ damage: 1, killed: 0 })
  })
  it('does not prevent ordinary wounds with a Psychic-only buff', () => {
    const scenario = input()
    scenario.target.psychicFeelNoPain = 5
    expect(attackSequence(scenario, rolls(3, 4, 2))).toEqual({ damage: 2, killed: 1 })
  })
  it('keeps a stronger unconditional defence against Psychic attacks', () => {
    const scenario = input()
    scenario.weapons[0]!.psychic = true
    scenario.target.feelNoPain = 4
    scenario.target.psychicFeelNoPain = 5
    expect(attackSequence(scenario, rolls(3, 4, 2, 4, 4, 4))).toEqual({ damage: 0, killed: 0 })
  })
})

it('budgets the per-wound rolls of conditional Psychic prevention', () => {
  const scenario = input()
  scenario.weapons[0]!.psychic = true
  scenario.weapons[0]!.count = 30
  scenario.weapons[0]!.attacks.bonus = 10
  scenario.weapons[0]!.damage.bonus = 10
  scenario.target.psychicFeelNoPain = 5
  expect(simulateCombat(scenario).trials).toBeLessThan(10_000)
})
