import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { reduceBattle } from '../../../core/battle'
import { ALICE, BOB, log, NAMES, started, turns } from '../../../core/battle.fixtures'
import { battleView } from '../../../core/battleView'
import { sides } from '../../sides'
import { PrimaryMission, SecondaryMissions } from './MissionCards'

function primaryMarkup(input = props()) {
  return renderToStaticMarkup(createElement(PrimaryMission, input))
}

function props() {
  const state = reduceBattle(
    [ALICE, BOB],
    log(
      [
        ALICE,
        {
          kind: 'set-prep',
          secondaryMode: 'fixed',
          stratagems: [],
          primary: { key: 'primary', name: 'Primary' },
          secondaries: [{ key: 'cleanse', name: 'Cleanse' }],
        },
      ],
      ...started(),
      [
        ALICE,
        {
          kind: 'score-settlement',
          scores: [
            { category: 'primary', delta: 2 },
            { category: 'secondary', key: 'cleanse', delta: 3 },
          ],
        },
      ],
      ...turns(10, ALICE),
      [
        ALICE,
        {
          kind: 'score-settlement',
          scores: [
            { category: 'primary', delta: 10 },
            { category: 'secondary', key: 'cleanse', delta: 2 },
          ],
          round: 2,
        },
      ],
    ),
  )
  const view = battleView({ token: 'test' }, NAMES, state, ALICE)
  return {
    view,
    side: sides(view)[0]!,
    actionable: false,
    pending: false,
    send: () => {},
    awardsFor: () => [],
    referenceFor: () => undefined,
    guides: view.guides,
  }
}

describe('mission scorecards', () => {
  it('shows primary points in their recorded rounds beside the battle total', () => {
    const markup = primaryMarkup()
    expect(markup).toContain('aria-label="Round 2: 10 VP"')
  })

  it('shows each secondary’s own round scores rather than the category total', () => {
    const input = props()
    input.side.rounds[1]!.secondary = 9
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, input))
    expect(markup).toContain('aria-label="Round 2: 2 VP"')
  })

  it('leaves future rounds empty', () => {
    const markup = primaryMarkup()
    expect(markup).toContain('aria-label="Round 5: not played"')
  })

  it('shows zero points in a played round', () => {
    const input = props()
    input.view.round = 3
    const markup = primaryMarkup(input)
    expect(markup).toContain('aria-label="Round 3: 0 VP"')
  })

  it('uses the battle’s round count', () => {
    const input = props()
    input.view.rounds = 4
    const markup = primaryMarkup(input)
    expect(markup.match(/aria-label="Round \d:/g)).toHaveLength(4)
  })

  it('shows a fixed card’s published battle cap', () => {
    const input = props()
    input.side.mission = {
      id: 'primary',
      name: 'Primary',
      roundCap: null,
      gameCap: 45,
      secondaryRoundCap: null,
      secondaryGameCap: 45,
      fixedSecondaryCap: 20,
    }
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, input))
    expect(markup).toContain('</span>/20</span>')
  })

  it('keeps returned cards out of the scorecards', () => {
    const input = props()
    input.side.secondaries[0]!.status = 'returned'
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, input))
    expect(markup).not.toContain('data-secondary="cleanse"')
  })

  it('offers a remaining-deck reference for tactical play', () => {
    const input = props()
    input.side.secondaryMode = 'tactical'
    input.side.remainingSecondaries = [{ key: 'beacon', name: 'Beacon' }]
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, input))
    expect(markup).toContain('aria-label="View remaining secondary missions (1)"')
  })

  it('does not offer a deck reference when the view withholds it', () => {
    const input = props()
    input.side.secondaryMode = 'tactical'
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, input))
    expect(markup).not.toContain('View remaining secondary missions')
  })

  it('highlights the current round while the battle is in progress', () => {
    const input = props()
    input.view.round = 2
    const markup = primaryMarkup(input)
    expect(markup).toContain('aria-label="Round 2: 10 VP" aria-current="step"')
  })

  it('does not highlight a current round in a finished battle', () => {
    const input = props()
    input.view.status = 'finished'
    const markup = primaryMarkup(input)
    expect(markup).not.toContain('aria-current="step"')
  })

  it('shares secondary round labels across the summary and active cards', () => {
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, props()))
    expect(markup.match(/>R1</g)).toHaveLength(1)
  })

  it('does not repeat empty round tracks on active tactical missions', () => {
    const input = props()
    input.side.secondaryMode = 'tactical'
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, input))
    expect(markup.slice(markup.indexOf('data-secondary="cleanse"'))).not.toContain('Round 5: not played')
  })

  it('preserves earned round history on active tactical missions', () => {
    const input = props()
    input.side.secondaryMode = 'tactical'
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, input))
    expect(markup).toContain('R2 · 2 VP')
  })

  it('omits round history on an unscored active tactical mission', () => {
    const input = props()
    input.side.secondaryMode = 'tactical'
    input.side.secondaries[0]!.rounds = [0, 0, 0, 0, 0]
    input.side.secondaries[0]!.points = 0
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, input))
    expect(markup).not.toContain('aria-label="Scored rounds"')
  })

  it('names only the scored round on a single-round active tactical mission', () => {
    const input = props()
    input.side.secondaryMode = 'tactical'
    input.side.secondaries[0]!.rounds = [5, 0, 0, 0, 0]
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, input))
    expect(markup).toContain('aria-label="Round 1: 5 VP">R1</li>')
  })

  it('shows completed missions automatically in a finished battle', () => {
    const input = props()
    input.view.status = 'finished'
    input.side.secondaries[0]!.status = 'achieved'
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, input))
    expect(markup).toContain('data-secondary="cleanse"')
  })

  it('does not repeat empty round cells on completed missions', () => {
    const input = props()
    input.view.status = 'finished'
    input.side.secondaries[0]!.status = 'achieved'
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, input))
    expect(markup).toContain('aria-label="Scored rounds"')
    expect(markup.slice(markup.indexOf('data-secondary="cleanse"'))).not.toContain('Round 5:')
  })

  it('does not repeat a single-round score beside the mission total', () => {
    const input = props()
    input.view.status = 'finished'
    input.side.secondaries[0]!.status = 'achieved'
    input.side.secondaries[0]!.rounds = [5, 0, 0, 0, 0]
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, input))
    expect(markup).not.toContain('R1 · 5 VP')
  })

  it('keeps the round breakdown when a completed mission scored in multiple rounds', () => {
    const input = props()
    input.view.status = 'finished'
    input.side.secondaries[0]!.status = 'achieved'
    const markup = renderToStaticMarkup(createElement(SecondaryMissions, input))
    expect(markup).toContain('R1 · 3 VP')
  })

  it('preserves recorded scores in a future round after a correction', () => {
    const input = props()
    input.view.round = 1
    const markup = primaryMarkup(input)
    expect(markup).toContain('aria-label="Round 2: 10 VP"')
  })
})
