import { describe, expect, it } from 'vitest'
import type { BattleView } from '../core/battleView'
import { facingSides, missionCardsReady, type SideMission, sideName, sides } from './sides'

type ViewPlayer = BattleView['players'][number]

function player(overrides: Partial<ViewPlayer> & Pick<ViewPlayer, 'id' | 'side'>): ViewPlayer {
  return {
    name: overrides.id,
    image: null,
    isViewer: false,
    automated: false,
    isActive: false,
    disposition: null,
    dispositionChoices: [],
    cp: 0,
    cpGained: 0,
    cpSpent: 0,
    cpByRound: [],
    canGainCp: true,
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
    secondariesDrawnThisTurn: [],
    ...overrides,
  }
}

const view = (players: ViewPlayer[], status: BattleView['status'] = 'playing') => ({ players, status }) as BattleView

describe('battle sides', () => {
  it('counts a side of practice opponents as one the viewer plays', () => {
    const [yours, theirs] = sides(
      view([player({ id: 'you', side: 0, isViewer: true }), player({ id: 'practice', side: 1, automated: true })]),
    )

    expect(yours).toMatchObject({ automated: false, played: true })
    expect(theirs).toMatchObject({ automated: true, played: true })
  })

  it('leaves a side with a signed-in player on it to that player', () => {
    const [, theirs] = sides(
      view([
        player({ id: 'you', side: 0, isViewer: true }),
        player({ id: 'them', side: 1 }),
        player({ id: 'practice', side: 1, automated: true }),
      ]),
    )

    expect(theirs).toMatchObject({ automated: false, played: false })
  })

  it('writes for a side from the first seat someone can sign in to, not the first seat', () => {
    // A practice opponent never opens the app, so a side it happens to sit first on
    // still has to be settled by the ally beside it rather than by nobody at all.
    const [, theirs] = sides(
      view([
        player({ id: 'you', side: 0, isViewer: true }),
        player({ id: 'practice', side: 1, automated: true }),
        player({ id: 'them', side: 1 }),
      ]),
    )

    expect(theirs?.captain.id).toBe('practice')
    expect(theirs?.writer.id).toBe('them')
  })

  it('leaves a side of practice opponents alone writing for itself, since the table plays it', () => {
    const [, theirs] = sides(
      view([
        player({ id: 'you', side: 0, isViewer: true }),
        player({ id: 'practice', side: 1, automated: true }),
        player({ id: 'practice-two', side: 1, automated: true }),
      ]),
    )

    expect(theirs).toMatchObject({ automated: true, played: true })
    expect(theirs?.writer.id).toBe('practice')
  })

  it('folds a 2v1 allied pair into one side', () => {
    expect(sides(view([player({ id: 'solo', side: 0 }), player({ id: 'ally', side: 1 }), player({ id: 'other', side: 1 })]))).toHaveLength(
      2,
    )
  })

  it('folds doubles into two armies but one resource pool per side', () => {
    const folded = sides(
      view([
        player({ id: 'red-one', side: 0, cp: 3 }),
        player({ id: 'red-two', side: 0, cp: 3 }),
        player({ id: 'blue-one', side: 1, cp: 5 }),
        player({ id: 'blue-two', side: 1, cp: 5 }),
      ]),
    )

    expect(folded.map((side) => [side.armies.length, side.cp])).toEqual([
      [2, 3],
      [2, 5],
    ])
  })

  it('reads shared command points from the side rather than each ally', () => {
    const battle = view([player({ id: 'ally', side: 1, cp: 4 }), player({ id: 'other', side: 1, cp: 4 })])
    expect(sides(battle)[0]?.cp).toBe(4)
  })

  // An allied pair fields one army between them, so the bonus is claimed once. The
  // domain has already folded it, and every seat carries the side's copy of it.
  it('claims the battle-ready bonus once for a side of two armies', () => {
    const battle = view([
      player({ id: 'ally', side: 0, painted: true, paintedPoints: 10 }),
      player({ id: 'other', side: 0, painted: true, paintedPoints: 10 }),
    ])
    expect(sides(battle)[0]?.paintedPoints).toBe(10)
  })

  it('keeps the battle-ready bonus out of a running score', () => {
    const battle = view([
      player({ id: 'ally', side: 0, primary: 20, secondary: 12, painted: true, paintedPoints: 10 }),
      player({ id: 'other', side: 0, primary: 20, secondary: 12, painted: true, paintedPoints: 10 }),
    ])
    expect(sides(battle)[0]?.total).toBe(32)
  })

  it('totals a side once from its shared score and its one bonus when the battle is over', () => {
    const battle = view(
      [
        player({ id: 'ally', side: 0, primary: 20, secondary: 12, painted: true, paintedPoints: 10 }),
        player({ id: 'other', side: 0, primary: 20, secondary: 12, painted: true, paintedPoints: 10 }),
      ],
      'finished',
    )
    expect(sides(battle)[0]?.total).toBe(42)
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
      },
    } satisfies ViewPlayer['roster']
    const units = [
      { key: 'a', name: 'A', points: 120, models: 1, destroyed: false, deployed: true, formation: 'battlefield', alive: 1, damage: 0 },
      { key: 'b', name: 'B', points: 95, models: 5, destroyed: false, deployed: true, formation: 'battlefield', alive: 5, damage: 0 },
    ] satisfies ViewPlayer['units']
    expect(sides(view([player({ id: 'you', side: 0, roster, units })]))[0]?.armies[0]?.points).toBe(215)
  })

  it('leaves an army unpriced when no list is attached', () => {
    expect(sides(view([player({ id: 'you', side: 0 })]))[0]?.armies[0]?.points).toBeNull()
  })

  it('leaves a pasted army unpriced even while its units are tracked', () => {
    const roster = { name: 'Pasted', text: 'the list as text' } satisfies ViewPlayer['roster']
    const units = [
      { key: 'a', name: 'A', points: 0, models: 3, destroyed: false, deployed: true, formation: 'battlefield', alive: 3, damage: 0 },
    ] satisfies ViewPlayer['units']
    expect(sides(view([player({ id: 'you', side: 0, roster, units })]))[0]?.armies[0]?.points).toBeNull()
  })
})

describe('the order a hand is drawn in', () => {
  const card = (key: string, status: 'active' | 'achieved' | 'discarded' | 'returned') =>
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

describe('the mission a side is held to', () => {
  const mission = (id: string, roundCap: number): SideMission => ({
    id,
    name: id,
    roundCap,
    gameCap: 45,
    secondaryRoundCap: 15,
    secondaryGameCap: 45,
  })
  const table = [player({ id: 'alice', side: 0, isViewer: true }), player({ id: 'bob', side: 1 })]

  it('gives each side the mission it is playing rather than the viewer’s', () => {
    const folded = sides(view(table), [
      { side: 0, mission: mission('theirs-is-not-yours', 15) },
      { side: 1, mission: mission('nor-yours-theirs', 10) },
    ])

    expect(folded.map((side) => side.mission?.roundCap)).toEqual([15, 10])
  })

  it('states no mission for a side none was resolved for', () => {
    const folded = sides(view(table), [{ side: 0, mission: mission('only-one-side-known', 15) }])
    expect(folded.map((side) => side.mission)).toEqual([expect.objectContaining({ roundCap: 15 }), null])
  })

  it('leaves a caller that asks for none wearing nobody’s', () => {
    expect(sides(view(table)).every((side) => side.mission === null)).toBe(true)
  })

  it('does not call mission cards ready until the primary and tactical deck are present', () => {
    const [missing] = sides(view([player({ id: 'alice', side: 0 })]), [{ side: 0, mission: mission('mission-a', 15) }])
    const [ready] = sides(
      view([
        player({
          id: 'alice',
          side: 0,
          primaryCard: { key: 'mission-a', name: 'Mission A' },
          remainingSecondaries: [{ key: 'secondary-a', name: 'Secondary A' }],
        }),
      ]),
      [{ side: 0, mission: mission('mission-a', 15) }],
    )

    expect(missionCardsReady(missing!)).toBe(false)
    expect(missionCardsReady(ready!)).toBe(true)
  })
})
