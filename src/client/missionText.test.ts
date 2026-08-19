import { describe, expect, it } from 'vitest'
import { awardLimit, awardTotal, conditionLabel, type MissionAward } from './missionText'

const per = (vp: number, max: number | null) => ({ vp, max, per: 'enemy-unit-destroyed-this-turn' })

describe('what a payout is worth', () => {
  it('counts on past the last whole multiple of a ceiling', () => {
    expect(awardLimit(per(2, 5))).toBe(3)
  })

  it('stops paying at the ceiling', () => {
    expect(awardTotal(per(2, 5), 3)).toBe(5)
  })

  it('pays per something up to the ceiling', () => {
    expect(awardTotal(per(2, 5), 2)).toBe(4)
  })

  it('leaves an uncapped payout unbounded', () => {
    expect(awardLimit(per(3, null))).toBeNull()
    expect(awardTotal(per(3, null), 4)).toBe(12)
  })

  it('pays a flat payout once however many times it is counted', () => {
    expect(awardTotal({ vp: 5, max: null, per: null }, 3)).toBe(5)
  })

  it('pays nothing when the condition was not met', () => {
    expect(awardTotal(per(2, 5), 0)).toBe(0)
  })
})

describe('what a card asks for', () => {
  const award = (overrides: Partial<MissionAward>): MissionAward => ({
    vp: 5,
    per: null,
    mode: null,
    when: null,
    max: null,
    parameters: {},
    operator: null,
    operands: [],
    group: null,
    cumulative: false,
    trigger: { timing: null, phase: null, playerTurn: null, roundMin: null, roundMax: null },
    ...overrides,
  })

  it('reads a condition the card states in two alternative parts as one sentence', () => {
    const label = conditionLabel(
      award({
        operator: 'or',
        operands: [
          { type: 'controls-objective', parameters: { count_min: 1, objective: 'opponent-home' } },
          { type: 'controls-objective', parameters: { count_min: 1, objective_role: 'expansion' } },
        ],
      }),
    )
    expect(label).toBe('You control your opponent’s home objective, or you control an expansion objective.')
  })

  it('says nothing when the source described no condition', () => {
    expect(conditionLabel(award({}))).toBeNull()
  })
})
