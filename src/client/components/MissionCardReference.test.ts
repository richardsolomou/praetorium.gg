import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MissionAward } from '../missionText'
import { MissionCardReference } from './MissionCardReference'
import { textToken } from '../../core/sourceText'

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

const render = (card: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, card))

describe('mission card reference', () => {
  it('labels alternative and additional objectives', () => {
    const markup = render(
      createElement(MissionCardReference, {
        card: {
          name: 'Reconnaissance Sweep',
          text: '**WHEN DRAWN:** Select one friendly unit on the battlefield or embarked within a **TRANSPORT** on the battlefield to be your **beacon** unit.',
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
  })

  it('uses the relationship label instead of legacy plus marks on a cumulative payout', () => {
    const cumulative = { ...award(2, 'For each of those objectives.', null), cumulative: true }
    const markup = render(
      createElement(MissionCardReference, {
        card: {
          name: 'Take and Hold',
          text: null,
          awards: [award(3, 'For each objective you control.', null), cumulative],
        },
        type: 'Take and Hold',
      }),
    )

    expect(markup).toContain('aria-label="Additional objective"')
    expect(markup).toContain('>plus</span>')
    expect(markup).not.toContain('+2 VP')
    expect(markup).toContain('>2<span')
  })

  it('shows an end-of-battle payout without battle-round or turn qualifiers', () => {
    const markup = render(
      createElement(MissionCardReference, {
        card: {
          name: 'Vanguard Operation',
          text: null,
          awards: [
            {
              ...award(10, 'You control your opponent’s home objective.', null),
              trigger: { ...trigger, timing: 'end-of-battle' },
            },
          ],
        },
        type: 'Priority Assets',
      }),
    )

    expect(markup).toContain('When</span>End of battle')
    expect(markup).not.toContain('Any battle round')
    expect(markup).not.toContain('Your turn')
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
  const withAction = () =>
    render(createElement(MissionCardReference, { card: { name: 'Secure Asset', text: null, awards: [], actions: [action] } }))

  it('names an action the card names without the pack’s own words', () => {
    const markup = withAction()
    expect([markup.includes('SECURE ASSET'), markup.includes('secures the asset')]).toEqual([true, false])
  })

  it('names each payout from its numbers where no summary says what it asks', () => {
    const words = (hash: string) => textToken({ file: '0123abcd', transform: 'prose', hash })
    const markup = render(
      createElement(MissionCardReference, {
        card: {
          name: 'Take and Hold',
          text: null,
          awards: [award(3, words('0'.repeat(16)), 'hold'), award(6, words('1'.repeat(16)), 'hold')],
        },
      }),
    )
    expect([markup.includes('The lower payout.'), markup.includes('The higher payout.')]).toEqual([true, true])
  })
})
