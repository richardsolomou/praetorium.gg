import { describe, expect, it } from 'vitest'
import type { WhenDrawn } from '../../../contracts/missions'
import { redrawOffer } from './drawOffer'

const roundRule = (roundMax: number): WhenDrawn => ({ operation: 'redraw', roundMax, heldCards: [] })

describe('redrawOffer', () => {
  it('names round one without claiming there is an earlier round', () => {
    expect(redrawOffer(roundRule(1), 1, [])).toMatchObject({
      message: 'You must put this back in battle round 1.',
      required: true,
    })
  })

  it('keeps the inclusive wording for later thresholds', () => {
    expect(redrawOffer(roundRule(3), 2, [])?.message).toBe('You must put this back in battle round 3 or earlier.')
  })

  it('offers an optional first-round return without blocking the draw', () => {
    expect(redrawOffer({ ...roundRule(1), required: false }, 1, [])).toMatchObject({
      message: 'You can put this back in battle round 1.',
      required: false,
    })
  })

  it('does not offer a redraw after the threshold', () => {
    expect(redrawOffer(roundRule(1), 2, [])).toBeNull()
  })

  it('offers paired-card redraws as optional', () => {
    const rule: WhenDrawn = { operation: 'redraw', roundMax: null, heldCards: ['cleanse'] }
    expect(redrawOffer(rule, 2, [{ key: 'cleanse' }])).toEqual({
      message: 'You can put this back while its paired mission is active.',
      status: 'returned',
      label: 'Put back and draw another',
      required: false,
    })
  })

  it('pairs with a card a battle saved by its Game Datacards ID', () => {
    const rule: WhenDrawn = { operation: 'redraw', roundMax: null, heldCards: ['chapter-approved-2026-2027.cleanse'] }
    expect(redrawOffer(rule, 2, [{ key: 'b50dc2df-5fc8-419d-a15a-449879497fc7' }])?.status).toBe('returned')
  })

  it('discards a conditional replacement the player judges from the card', () => {
    expect(redrawOffer({ operation: 'replace', roundMax: null, heldCards: [] }, 1, [])).toEqual({
      message: 'Discard this if the card’s condition holds.',
      status: 'discarded',
      label: 'Discard and draw another',
      required: false,
    })
  })
})
