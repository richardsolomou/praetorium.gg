import { describe, expect, it } from 'vitest'
import { redrawOffer, type WhenDrawn } from './drawOffer'

const roundRule = (roundMax: number): WhenDrawn => ({ operation: 'redraw', roundMax, heldCards: [], condition: null })

describe('redrawOffer', () => {
  it('names round one without claiming there is an earlier round', () => {
    expect(redrawOffer(roundRule(1), 1, [])?.message).toBe('You may put this back in battle round 1.')
  })

  it('keeps the inclusive wording for later thresholds', () => {
    expect(redrawOffer(roundRule(3), 2, [])?.message).toBe('You may put this back in battle round 3 or earlier.')
  })

  it('does not offer a redraw after the threshold', () => {
    expect(redrawOffer(roundRule(1), 2, [])).toBeNull()
  })

  it('discards a mandatory conditional replacement instead of returning it', () => {
    const rule: WhenDrawn = {
      operation: 'replace',
      roundMax: null,
      heldCards: [],
      condition: 'there are no enemy units with a Starting Strength of 5 or more on the battlefield',
    }
    expect(redrawOffer(rule, 1, [])).toEqual({
      message: 'Discard this if there are no enemy units with a Starting Strength of 5 or more on the battlefield.',
      status: 'discarded',
      label: 'Discard and draw another',
    })
  })

  it('does not invent a mandatory replacement without a board condition', () => {
    const rule: WhenDrawn = { operation: 'replace', roundMax: null, heldCards: [], condition: null }
    expect(redrawOffer(rule, 1, [])).toBeNull()
  })
})
