import { describe, expect, it } from 'vitest'
import { redrawOffer, type WhenDrawn } from './drawOffer'

const roundRule = (roundMax: number): WhenDrawn => ({ operation: 'redraw', roundMax, heldCards: [], condition: null })

describe('redrawOffer', () => {
  it('names round one without claiming there is an earlier round', () => {
    expect(redrawOffer(roundRule(1), 1, [])).toBe('You may put this back in battle round 1.')
  })

  it('keeps the inclusive wording for later thresholds', () => {
    expect(redrawOffer(roundRule(3), 2, [])).toBe('You may put this back in battle round 3 or earlier.')
  })

  it('does not offer a redraw after the threshold', () => {
    expect(redrawOffer(roundRule(1), 2, [])).toBeNull()
  })
})
