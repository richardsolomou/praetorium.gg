import { describe, expect, it } from 'vitest'
import { isRosterNotUsable, ROSTER_NOT_USABLE } from './rosterUse'

describe('isRosterNotUsable', () => {
  it('recognises the refusal once it has crossed the wire', () => {
    expect(isRosterNotUsable(new Error(`${ROSTER_NOT_USABLE}: roster has 2005 points, over its 2000-point limit`))).toBe(true)
    expect(isRosterNotUsable(new Error(`${ROSTER_NOT_USABLE}: Pick a disposition.`))).toBe(true)
  })

  it('leaves another refusal alone', () => {
    expect(isRosterNotUsable(new Error('you do not own this roster'))).toBe(false)
    expect(isRosterNotUsable(new Error('army data is not available'))).toBe(false)
  })

  it('leaves a genuine failure alone', () => {
    expect(isRosterNotUsable(new Error('something broke'))).toBe(false)
    expect(isRosterNotUsable(new Error(''))).toBe(false)
  })

  it('leaves a non-object rejection alone', () => {
    expect(isRosterNotUsable(`${ROSTER_NOT_USABLE}: Pick a disposition.`)).toBe(false)
    expect(isRosterNotUsable(null)).toBe(false)
    expect(isRosterNotUsable(undefined)).toBe(false)
  })
})
