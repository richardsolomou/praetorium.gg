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
