import { describe, expect, it } from 'vitest'
import { deploymentRules, findEnhancementDescription, resolveDisposition } from './pricing'
import { descriptionKey } from './wahapedia'

describe('force disposition', () => {
  it('uses the only available disposition', () => {
    expect(resolveDisposition(['reconnaissance'], null)).toEqual({ disposition: 'reconnaissance', error: null })
  })

  it('requires a choice when several are available', () => {
    expect(resolveDisposition(['reconnaissance', 'disruption'], null)).toEqual({ disposition: null, error: 'Pick a disposition.' })
  })

  it('keeps a valid choice', () => {
    expect(resolveDisposition(['reconnaissance', 'disruption'], 'disruption')).toEqual({ disposition: 'disruption', error: null })
  })
})

describe('enhancement descriptions', () => {
  it('matches a minor name correction within the selected detachment', () => {
    const descriptions = new Map([
      [descriptionKey('Cursed Legion', 'Mask of the Nekrosor'), 'Each time this unit attacks, add 1 to the Hit roll.'],
    ])

    expect(findEnhancementDescription(descriptions, [{ name: 'Cursed Legion' }], 'Mark of the Nekrosor')).toBe(
      'Each time this unit attacks, add 1 to the Hit roll.',
    )
  })
})

describe('catalogue-backed deployment rules', () => {
  it('derives every supported pre-battle option from ability names', () => {
    expect(deploymentRules(['Deep Strike', 'Infiltrators', 'Scouts 6"'])).toEqual({
      formationOptions: ['deep-strike'],
      prebattleRules: ['infiltrators', 'scouts'],
    })
  })

  it('does not invent deployment options without matching abilities', () => {
    expect(deploymentRules(['Leader', 'Stealth'])).toEqual({ formationOptions: [], prebattleRules: [] })
  })
})
