import { describe, expect, it } from 'vitest'
import type { BattleView } from '../core/battle'
import { facingSides, sideName, sides } from './sides'

type ViewPlayer = BattleView['players'][number]

function player(overrides: Partial<ViewPlayer> & Pick<ViewPlayer, 'id' | 'side'>): ViewPlayer {
  return {
    name: overrides.id,
    image: null,
    isViewer: false,
    isActive: false,
    cp: 0,
    cpGained: 0,
    cpSpent: 0,
    cpByRound: [],
    primary: 0,
    secondary: 0,
    total: 0,
    painted: false,
    paintedPoints: 0,
    rounds: [],
    roster: null,
    units: [],
    standing: 0,
    deployed: 0,
    stratagems: [],
    secondaries: [],
    primaryCard: null,
    secondaryMode: 'tactical',
    remainingSecondaries: [],
    ...overrides,
  }
}

const view = (players: ViewPlayer[], status: BattleView['status'] = 'playing') => ({ players, status }) as BattleView

describe('battle sides', () => {
  it('folds a 2v1 allied pair into one side', () => {
    expect(sides(view([player({ id: 'solo', side: 0 }), player({ id: 'ally', side: 1 }), player({ id: 'other', side: 1 })]))).toHaveLength(
      2,
    )
  })

  it('reads shared command points from the side rather than each ally', () => {
    const battle = view([player({ id: 'ally', side: 1, cp: 4 }), player({ id: 'other', side: 1, cp: 4 })])
    expect(sides(battle)[0]?.cp).toBe(4)
  })

  it('adds the battle-ready bonus of every army on a side', () => {
    const battle = view([
      player({ id: 'ally', side: 0, painted: true, paintedPoints: 10 }),
      player({ id: 'other', side: 0, painted: true, paintedPoints: 10 }),
    ])
    expect(sides(battle)[0]?.paintedPoints).toBe(20)
  })

  it('keeps the battle-ready bonus out of a running score', () => {
    const battle = view([
      player({ id: 'ally', side: 0, primary: 20, secondary: 12, painted: true, paintedPoints: 10 }),
      player({ id: 'other', side: 0, primary: 20, secondary: 12, painted: true, paintedPoints: 10 }),
    ])
    expect(sides(battle)[0]?.total).toBe(32)
  })

  it('totals a side once from its shared score and both bonuses when the battle is over', () => {
    const battle = view(
      [
        player({ id: 'ally', side: 0, primary: 20, secondary: 12, painted: true, paintedPoints: 10 }),
        player({ id: 'other', side: 0, primary: 20, secondary: 12, painted: true, paintedPoints: 10 }),
      ],
      'finished',
    )
    expect(sides(battle)[0]?.total).toBe(52)
  })

  it('orders sides by seat so both devices agree on the tints', () => {
    expect(sides(view([player({ id: 'second', side: 1 }), player({ id: 'first', side: 0 })])).map((side) => side.index)).toEqual([0, 1])
  })

  it('puts the viewer’s own side first when facing the table', () => {
    const battle = view([player({ id: 'them', side: 0 }), player({ id: 'you', side: 1, isViewer: true })])
    expect(facingSides(battle).yours?.index).toBe(1)
  })

  it('names an allied side after both players', () => {
    const battle = view([player({ id: 'ally', name: 'Ally', side: 0 }), player({ id: 'other', name: 'Other', side: 0 })])
    expect(sides(battle).map(sideName)).toEqual(['Ally & Other'])
  })

  it('prices an army from the units it submitted', () => {
    const roster = {
      name: 'List',
      text: '',
      built: {
        catalogueId: 'catalogue',
        revision: 'revision',
        limit: 2000,
        detachment: null,
        disposition: null,
        selections: [],
        units: [
          { key: 'a', name: 'A', points: 120, models: 1 },
          { key: 'b', name: 'B', points: 95, models: 5 },
        ],
      },
    } satisfies ViewPlayer['roster']
    expect(sides(view([player({ id: 'you', side: 0, roster })]))[0]?.armies[0]?.points).toBe(215)
  })

  it('leaves an army unpriced when no list is attached', () => {
    expect(sides(view([player({ id: 'you', side: 0 })]))[0]?.armies[0]?.points).toBeNull()
  })
})

describe('the order a hand is drawn in', () => {
  const card = (key: string, status: 'active' | 'achieved' | 'discarded') =>
    ({ key, name: key, status, points: 0, secret: false, revealed: false }) as ViewPlayer['secondaries'][number]
  const hand = (...cards: ViewPlayer['secondaries']) => sides(view([player({ id: 'you', side: 0, secondaries: cards })]))[0]?.secondaries

  it('lifts a card that is still in play above one that is done', () => {
    expect(hand(card('done', 'achieved'), card('live', 'active'))?.map((entry) => entry.key)).toEqual(['live', 'done'])
  })

  it('drops a card back among the settled ones once it is scored', () => {
    expect(hand(card('first', 'achieved'), card('second', 'discarded'))?.map((entry) => entry.key)).toEqual(['first', 'second'])
  })

  it('leaves a hand of live cards in the order it was dealt', () => {
    expect(hand(card('one', 'active'), card('two', 'active'))?.map((entry) => entry.key)).toEqual(['one', 'two'])
  })
})
