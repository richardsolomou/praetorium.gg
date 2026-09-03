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
          actions: [],
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

  it('uses the relationship label instead of legacy plus marks on a cumulative payout', () => {
    const cumulative = { ...award(2, 'For each of those objectives.', null), cumulative: true }
    const markup = renderToStaticMarkup(
      createElement(MissionCardReference, {
        card: {
          name: 'Take and Hold',
          text: null,
          awards: [award(3, 'For each objective you control.', null), cumulative],
          actions: [],
        },
        type: 'Take and Hold',
      }),
    )

    expect(markup).toContain('aria-label="Additional objective"')
    expect(markup).toContain('>plus</span>')
    expect(markup).not.toContain('+2 VP')
    expect(markup).toContain('>2 VP</span>')
  })

  it('prints the action the card names beside what it pays', () => {
    const markup = renderToStaticMarkup(
      createElement(MissionCardReference, {
        card: {
          name: 'Secure Asset',
          text: null,
          awards: [award(4, 'A friendly unit secured the asset this turn.', null)],
          actions: [
            {
              name: 'SECURE ASSET',
              starts: 'Your Shooting phase.',
              completes: 'End of your turn, if your unit controls that **objective**.',
              effect: 'Your unit **secures the asset**.',
              units: 'One friendly unit within range of one **objective**.',
              useLimit: 'Once per turn.',
              restriction: null,
            },
          ],
        },
        type: 'Priority Assets',
      }),
    )

    expect(markup).toContain('SECURE ASSET')
    expect(markup).toContain('Effect:')
    expect(markup).toContain('secures the asset')
    expect(markup).toContain('Once per turn.')
    expect(markup).not.toContain('Restriction:')
  })
})
