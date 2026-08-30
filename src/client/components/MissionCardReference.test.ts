import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MissionAward } from '../missionText'
import { MissionCardReference } from './MissionCardReference'

const trigger = {
  timing: 'end-of-turn',
  phase: null,
  playerTurn: 'your-turn',
  roundMin: null,
  roundMax: null,
}

const award = (vp: number, criteria: string, group: string | null): MissionAward => ({
  vp,
  criteria,
  group,
  trigger,
  per: null,
  mode: null,
  max: null,
  cumulative: false,
})

describe('mission card reference', () => {
  it('labels alternative and additional objectives without flavour text', () => {
    const markup = renderToStaticMarkup(
      createElement(MissionCardReference, {
        card: {
          name: 'Reconnaissance Sweep',
          text: 'Atmospheric mission flavour.',
          awards: [
            award(3, 'Have a presence in three table quarters.', 'table-quarters'),
            award(6, 'Have a presence in four table quarters.', 'table-quarters'),
            award(1, 'For each enemy unit destroyed this turn.', null),
          ],
        },
        type: 'Reconnaissance',
      }),
    )

    expect(markup).toContain('aria-label="Alternative objective"')
    expect(markup).toContain('>or</span>')
    expect(markup).toContain('aria-label="Additional objective"')
    expect(markup).toContain('>plus</span>')
    expect(markup).not.toContain('Atmospheric mission flavour.')
  })
})
