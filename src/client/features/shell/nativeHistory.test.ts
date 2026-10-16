import { describe, expect, it } from 'vitest'
import { historyBackStaysInTab, openedByTab } from './nativeHistory'

describe('native history back', () => {
  it('goes back to the screen that opened this one', () => {
    expect(historyBackStaysInTab(1, {})).toBe(true)
  })

  it('does not go back into the tab the player switched from', () => {
    expect(historyBackStaysInTab(1, openedByTab({ __TSR_index: 0 }))).toBe(false)
  })

  it('goes back from a screen stacked on the one the tab opened', () => {
    expect(historyBackStaysInTab(2, openedByTab({ __TSR_index: 0 }))).toBe(true)
  })

  it('has nothing behind the first screen of the session', () => {
    expect(historyBackStaysInTab(0, {})).toBe(false)
  })

  it('keeps the rest of the entry state when marking a tab switch', () => {
    expect(openedByTab({ __TSR_index: 0, rosterPane: 'picker' })).toMatchObject({ rosterPane: 'picker' })
  })
})
