import {
  attackRolls,
  bestReroll,
  combatSchema,
  rollSucceeds,
  saveSucceeds,
  targetModels,
  targetWounds,
  type CombatInput,
  type CombatOptions,
  type DiceExpression,
} from './combat'

/**
 * One attack sequence rolled die by die, the way players resolve it at the table.
 *
 * `calculateCombat` derives exact probabilities instead. Tests pin each rule here with scripted
 * rolls and require the exact distributions to match this sequence's sampled ones.
 */

const d6 = (random: () => number) => Math.floor(random() * 6) + 1

function roll(expression: DiceExpression | number, random: () => number) {
  if (typeof expression === 'number') return expression
  let result = expression.bonus
  for (let i = 0; i < expression.dice; i++) result += Math.floor(random() * expression.sides) + 1
  return result
}

function check(target: number, bonus: number, critical: number, rerolls: CombatOptions['hitReroll'], random: () => number, minimum = 2) {
  const succeeds = (value: number) => rollSucceeds(value, target, bonus, critical, minimum)
  let value = d6(random)
  if ((rerolls === 'ones' && value === 1) || (rerolls === 'failed' && !succeeds(value))) value = d6(random)
  return { success: succeeds(value), critical: value !== 1 && value >= critical, value }
}

export function attackSequence({ target, weapons, options, mortalWounds = [] }: CombatInput, random: () => number) {
  const models = targetModels(target)
  const alive = target.groups.map((group) => group.models)
  let current = 0
  let killed = 0
  let remaining = target.groups[0]!.wounds - (target.damage ?? 0)
  let damage = 0
  // Wound rolls happen before any save, so a pool uses the highest Toughness still on the battlefield (05.02.01).
  const toughness = () => Math.max(...target.groups.flatMap((group, index) => (alive[index] ? [group.toughness] : [])))
  const destroyOne = () => {
    killed++
    alive[current]!--
    if (!alive[current]) current++
    remaining = target.groups[current]?.wounds ?? 0
  }
  const inflictMortals = (timing: 'before' | 'after') => {
    for (const ability of mortalWounds) {
      if (ability.timing !== timing) continue
      const feelNoPain = Math.min(
        target.feelNoPain ?? 7,
        target.mortalFeelNoPain ?? 7,
        ability.psychic ? (target.psychicFeelNoPain ?? 7) : 7,
      )
      for (let attempt = 0; attempt < ability.rolls; attempt++) {
        if (killed === models) break
        const result = d6(random)
        const outcome = ability.outcomes.find((candidate) => result >= candidate.min && result <= candidate.max)
        if (!outcome) continue
        const wounds = roll(outcome.damage, random)
        for (let wound = 0; wound < wounds; wound++) {
          if (killed === models) break
          if (feelNoPain < 7 && d6(random) >= feelNoPain) continue
          damage++
          if (--remaining === 0) destroyOne()
        }
      }
    }
  }
  inflictMortals('before')
  if (killed === models) return { damage, killed }
  const ranged = options.phase === 'ranged'
  for (const weapon of weapons) {
    if (killed === models) return { damage, killed }
    const defending = toughness()
    const { indirect, skill, hitBonus, woundBonus, wound } = attackRolls(weapon, options, defending)
    const halfRange = ranged && options.halfRange
    const feelNoPain = weapon.psychic ? Math.min(target.feelNoPain ?? 7, target.psychicFeelNoPain ?? 7) : (target.feelNoPain ?? 7)
    const inflict = (mortal = false) => {
      let rolledDamage = roll(weapon.damage, random)
      if (weapon.damageReroll === 'ones' && rolledDamage === 1) rolledDamage = roll(weapon.damage, random)
      const baseDamage = rolledDamage + (halfRange ? roll(weapon.melta, random) : 0)
      const rolled = baseDamage === 0 ? 0 : Math.max(1, Math.ceil(baseDamage / (target.damageDivisor ?? 1) - (target.damageReduction ?? 0)))
      let lost = rolled
      const prevention = mortal ? Math.min(feelNoPain, target.mortalFeelNoPain ?? 7) : feelNoPain
      if (prevention < 7) {
        lost = 0
        for (let i = 0; i < rolled; i++) if (d6(random) < prevention) lost++
      }
      damage += Math.min(remaining, lost)
      remaining -= lost
      if (remaining <= 0) destroyOne()
    }
    const saves: boolean[] = []
    const resolveHit = (automatic: boolean) => {
      const result = automatic
        ? { success: true, critical: false, value: 0 }
        : check(
            wound,
            woundBonus,
            weapon.criticalWound,
            weapon.twinLinked ? 'failed' : bestReroll(options.woundReroll, weapon.woundReroll),
            random,
          )
      if (!result.success) return
      if (weapon.successfulCriticalWound && result.value >= weapon.successfulCriticalWound) result.critical = true
      if (weapon.devastating && result.critical) inflict(true)
      else saves.push(result.critical)
    }
    for (let carrier = 0; carrier < weapon.count; carrier++) {
      const attacks =
        roll(weapon.attacks, random) +
        (weapon.blast + (weapon.cleave ?? 0)) * Math.floor(models / 5) +
        (halfRange ? roll(weapon.rapidFire, random) : 0)
      for (let attack = 0; attack < attacks; attack++) {
        if (killed === models) break
        const hit = weapon.torrent
          ? { success: true, critical: false, value: 0 }
          : check(
              skill,
              hitBonus,
              weapon.criticalHit ?? 6,
              indirect ? 'none' : bestReroll(options.hitReroll, weapon.hitReroll),
              random,
              indirect ? (options.indirectFire === 'spotted' ? 4 : 6) : 2,
            )
        if (!hit.success) continue
        if (weapon.successfulCriticalHit && hit.value >= weapon.successfulCriticalHit) hit.critical = true
        if (weapon.allHitsCritical && !weapon.torrent) hit.critical = true
        resolveHit(hit.critical && weapon.lethal && options.lethal)
        if (hit.critical && killed < models) {
          const sustained = roll(weapon.sustained, random)
          for (let extra = 0; extra < sustained; extra++) {
            if (killed === models) break
            resolveHit(false)
          }
        }
      }
    }
    // Re-rolls happen while the pool's saves are rolled, before any of them is allocated, so they judge the group current then.
    const rolling = target.groups[current]!
    const rolls = saves
      .map((critical) => {
        const value = d6(random)
        const again =
          target.saveReroll === 'failed' ? !saveSucceeds(value, critical, rolling, weapon) : target.saveReroll === 'ones' && value === 1
        return { value: again ? d6(random) : value, critical }
      })
      .toSorted((a, b) => a.value - b.value || Number(a.critical) - Number(b.critical))
    // Save rolls resolve from lowest to highest against whichever group is current (05.04); equal rolls take ordinary wounds first.
    for (const save of rolls) {
      if (killed === models) return { damage, killed }
      if (saveSucceeds(save.value, save.critical, target.groups[current]!, weapon)) continue
      inflict()
    }
  }
  inflictMortals('after')
  return { damage, killed }
}

/** Seeded sampling of the reference sequence, as distributions over models destroyed and wounds lost. */
export function sampleCombat(scenario: CombatInput, trials: number) {
  const input = combatSchema.parse(scenario)
  const kills = Array.from({ length: targetModels(input.target) + 1 }, () => 0)
  const damage = Array.from({ length: targetWounds(input.target) + 1 }, () => 0)
  let seed = 0x12345678
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  for (let i = 0; i < trials; i++) {
    const result = attackSequence(input, random)
    kills[result.killed]!++
    damage[result.damage]!++
  }
  return { kills: kills.map((count) => count / trials), damage: damage.map((count) => count / trials) }
}
