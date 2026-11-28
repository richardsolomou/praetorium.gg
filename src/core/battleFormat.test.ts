import { describe, expect, it } from 'vitest'
import { detachmentPointBudget, detachmentPointsError, formatRules } from './battleFormat'

const recorded = [{ points: 2_000, detachmentPoints: 1, enhancements: 4 }]

describe('battle sizes', () => {
  it("allows the Detachment points the rules version's record states", () => {
    expect(detachmentPointBudget(2_000, recorded)).toBe(1)
  })

  it("says the recorded allowance in the battle size's Detachment points rule", () => {
    expect(formatRules(2_000, null, recorded).find((rule) => rule.id === 'detachment-points')?.hint).toBe(
      'Take one detachment at any cost, or multiple for up to 1 DP total',
    )
  })
})

describe('Incursion detachment points', () => {
  it.each([
    { points: [1], legal: true },
    { points: [2], legal: true },
    { points: [1, 1], legal: true },
    { points: [3], legal: true },
    { points: [2, 1], legal: false },
    { points: [3, 1], legal: false },
  ])('checks $points against the detachment allowance', ({ points, legal }) => {
    expect(
      detachmentPointsError(
        points.map((cost) => ({ points: cost })),
        detachmentPointBudget(1_000),
      ) === null,
    ).toBe(legal)
  })
})
