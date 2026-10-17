import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MissionActions } from './MissionActions'

// These render a reader who has chosen to load rules text; `RuleText.test.ts` covers one who has not.
vi.mock('../rulesText', async (original) => {
  const actual = await original<typeof import('../rulesText')>()
  return { ...actual, useTextSourceChoice: () => actual.textSourceChoiceFrom('bsdata,game-datacards') }
})

const action = {
  name: 'SECURE ASSET',
  starts: 'Your Shooting phase.',
  completes: 'End of your turn, if your unit controls that **objective**.',
  effect: 'Your unit **secures the asset**.',
  units: 'One friendly unit within range of one **objective**.',
  useLimit: 'Once per turn.',
  restriction: null,
}

describe('mission actions', () => {
  it('prints every line the pack states for the action', () => {
    const markup = renderToStaticMarkup(createElement(MissionActions, { actions: [action] }))

    expect(markup).toContain('SECURE ASSET')
    expect(markup).toContain('Effect:')
    expect(markup).toContain('secures the asset')
    expect(markup).toContain('Once per turn.')
  })

  it('leaves out a line the pack does not state', () => {
    const markup = renderToStaticMarkup(createElement(MissionActions, { actions: [action] }))

    expect(markup).not.toContain('Restriction:')
  })

  it('prints nothing at all for a card that names no action', () => {
    expect(renderToStaticMarkup(createElement(MissionActions, { actions: [] }))).toBe('')
  })
})
