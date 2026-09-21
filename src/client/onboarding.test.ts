import { describe, expect, it } from 'vitest'
import {
  canOfferOnboardingWelcome,
  FIRST_ONBOARDING_STEP,
  focusAfterOnboardingOperation,
  nextOnboardingFocus,
  onboardingFocusStorageKey,
  onboardingPage,
  ONBOARDING_UI,
} from './onboarding'
import { onboardingTaskIds } from '../core/onboarding'

describe('onboarding page', () => {
  it.each([
    ['/rosters', 'rosters'],
    ['/rosters/', 'rosters'],
    ['/rosters/a-roster', 'roster'],
    ['/rosters/a-roster/', 'roster'],
    ['/friends', 'friends'],
    ['/battles', 'battles'],
    ['/battles/a-token', undefined],
    ['/', 'home'],
    ['/leagues', 'leagues'],
    ['/leagues/', 'leagues'],
    ['/leagues/a-league', 'league'],
    ['/factions', 'factions'],
    ['/factions/orks', 'faction'],
    ['/factions/orks/datasheets', 'datasheets'],
    ['/factions/orks/datasheets/boyz', 'datasheet'],
    ['/mission-packs/pack', 'missions'],
    ['/mission-matchups/pack/you/opponent', 'mission'],
    ['/leaderboard', 'leaderboard'],
    ['/rules', 'rules'],
    ['/rules/core-rules', 'rule-document'],
    ['/rules/core-rules/movement', 'rule-section'],
    ['/profile', 'profile'],
  ])('maps %s to %s', (path, page) => {
    expect(onboardingPage(path)).toBe(page)
  })
})

describe('onboarding coverage', () => {
  it('starts a tour for every major product area', () => {
    expect(Object.keys(FIRST_ONBOARDING_STEP)).toEqual(onboardingTaskIds)
  })

  it('walks from each reference index into its useful detail pages', () => {
    expect([
      ONBOARDING_UI['reference-search'].next,
      ONBOARDING_UI['reference-faction'].target,
      ONBOARDING_UI['reference-datasheet'].next,
      ONBOARDING_UI['reference-mission'].next,
      ONBOARDING_UI['reference-rule-document'].target,
      ONBOARDING_UI['reference-rule-section'].final,
    ]).toEqual(['reference-factions', 'faction-datasheets', 'reference-missions', 'reference-rules', 'rule-document', true])
  })

  it('walks through watching, standings, profiles, and sharing', () => {
    expect([
      ONBOARDING_UI['community-home'].next,
      ONBOARDING_UI['community-leaderboard'].next,
      ONBOARDING_UI['community-sharing'].final,
    ]).toEqual(['community-leaderboard', 'community-sharing', true])
  })

  it('walks through league setup and its event workspace', () => {
    expect([ONBOARDING_UI['league-start'].target, ONBOARDING_UI['league-setup'].page, ONBOARDING_UI['league-workspace'].final]).toEqual([
      'create-league',
      'leagues',
      true,
    ])
  })
})

describe('onboarding focus', () => {
  it('stores each account focus separately', () => {
    expect(onboardingFocusStorageKey('alice')).not.toBe(onboardingFocusStorageKey('bob'))
  })

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
