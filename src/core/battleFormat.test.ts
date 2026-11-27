import { describe, expect, it } from 'vitest'
import { detachmentPointBudget, formatRules } from './battleFormat'

const recorded = [{ points: 2_000, detachmentPoints: 1, enhancements: 4 }]

describe('battle sizes', () => {
  it("allows the Detachment points the rules version's record states", () => {
    expect(detachmentPointBudget(2_000, recorded)).toBe(1)
  })

  it('allows the unrecorded Detachment points of a size its rules version has no record of', () => {
    expect(detachmentPointBudget(1_000, recorded)).toBe(2)
  })

  it("says the recorded allowance in the battle size's Detachment points rule", () => {
    expect(formatRules(2_000, null, recorded).find((rule) => rule.id === 'detachment-points')?.hint).toBe(
      'Detachments cost at most 1 DP together',
    )
  })
})
