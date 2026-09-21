import { describe, expect, it } from 'vitest'
import { canOfferOnboardingWelcome, focusAfterOnboardingOperation, nextOnboardingFocus, onboardingPage } from './onboarding'

describe('onboarding page', () => {
  it.each([
    ['/rosters', 'rosters'],
    ['/rosters/', 'rosters'],
    ['/rosters/a-roster', 'roster'],
    ['/rosters/a-roster/', 'roster'],
    ['/friends', 'friends'],
    ['/battles', 'battles'],
    ['/battles/a-token', undefined],
  ])('maps %s to %s', (path, page) => {
    expect(onboardingPage(path)).toBe(page)
  })
})

describe('onboarding focus', () => {
  it('advances only the step that is currently focused', () => {
    expect(
      nextOnboardingFocus({ task: 'roster', step: 'roster-picker' }, { task: 'roster', from: 'roster-picker', to: 'roster-list' }),
    ).toEqual({ task: 'roster', step: 'roster-list' })
  })

  it('ignores ordinary actions outside the focused guide step', () => {
    const focus = { task: 'friend', step: 'friend-start' } as const
    expect(nextOnboardingFocus(focus, { task: 'roster', from: 'roster-picker', to: 'roster-list' })).toBe(focus)
  })

  it('clears a focused task when the player skips it', () => {
    expect(focusAfterOnboardingOperation({ task: 'roster', step: 'roster-list' }, { operation: 'skip', task: 'roster' })).toBeUndefined()
  })

  it('preserves focus when the player updates another task', () => {
    const focus = { task: 'roster', step: 'roster-list' } as const
    expect(focusAfterOnboardingOperation(focus, { operation: 'skip', task: 'friend' })).toBe(focus)
  })
})

describe('onboarding welcome', () => {
  it.each(['/sign-in', '/reset-password', '/native-auth'])('waits until the player leaves %s', (path) => {
    expect(canOfferOnboardingWelcome(path)).toBe(false)
  })

  it('can open on the destination after sign-in', () => {
    expect(canOfferOnboardingWelcome('/')).toBe(true)
  })
})
