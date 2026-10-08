import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { reduceBattle } from '../../../core/battle'
import type { Command } from '../../../core/battle'
import { ALICE, BOB, log, NAMES, started } from '../../../core/battle.fixtures'
import { battleClock } from '../../../core/battleClock'
import { battleView } from '../../../core/battleView'
import { EMPTY_ONBOARDING_PROGRESS } from '../../../core/onboarding'
import { deploymentsQuery, meQuery, onboardingQuery } from '../../queries'
import { Spectator } from './Spectator'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => createElement('a', { href: to }, children),
}))

function render(patternId: string | null, textOnly = true) {
  const commands = log(
    ...started().slice(0, -1),
    ...(patternId ? [[ALICE, { kind: 'set-battlefield', patternId, terrainLayoutId: 'bm-take-vs-recon-03' }] as [string, Command]] : []),
    started().at(-1)!,
    [ALICE, { kind: 'end-battle', reason: 'finished-early' }],
  )
  const view = battleView({ token: 'test' }, NAMES, reduceBattle([ALICE, BOB], commands), '')
  const client = new QueryClient()
  client.setQueryData(deploymentsQuery().queryKey, [
    { id: 'current-search-id', name: 'Search And Destroy', description: null, zones: [], objectives: [] },
  ])
  const markup = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(Spectator, { view, clock: battleClock([ALICE, BOB], commands), missions: [] }),
    ),
  )
  return textOnly ? markup.replaceAll(/<[^>]+>/g, '') : markup
}

describe('finished battle battlefield', () => {
  it.each(['current-search-id', 'search-and-destroy'])('shows the selected battlefield saved as %s', (patternId) => {
    expect(render(patternId)).toContain('BattlefieldSearch And Destroy')
  })

  it('says not chosen when the battle has no battlefield', () => {
    expect(render(null)).toContain('BattlefieldNot chosen')
  })

  it('opens the selected battlefield from its name', () => {
    expect(render('search-and-destroy', false)).toContain('aria-label="View Search And Destroy battlefield"')
  })

  it('has no map trigger without a chosen battlefield', () => {
    expect(render(null, false)).not.toContain('data-slot="dialog-trigger"')
  })
})

describe('invitation to track your own games', () => {
  function watch({ viewer = '', me = null as object | null, completedTasks = [] as ('roster' | 'battle')[], finished = true } = {}) {
    const commands = log(
      ...started(),
      ...(finished ? [[ALICE, { kind: 'end-battle', reason: 'finished-early' }] as [string, Command]] : []),
    )
    const view = battleView({ token: 'test' }, NAMES, reduceBattle([ALICE, BOB], commands), viewer)
    const client = new QueryClient()
    client.setQueryData(meQuery().queryKey, me as never)
    client.setQueryData(onboardingQuery().queryKey, { ...EMPTY_ONBOARDING_PROGRESS, completedTasks })
    return renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(Spectator, { view, clock: battleClock([ALICE, BOB], commands), missions: [] }),
      ),
    )
  }

  it('invites a signed-out reader of a finished battle to build an army', () => {
    expect(watch()).toContain('<a href="/rosters"')
  })

  it('invites a signed-out reader of a live battle too', () => {
    expect(watch({ finished: false })).toContain('Track your own games on Praetorium')
  })

  it('leads a signed-out reader to sign up before starting a battle', () => {
    expect(watch()).toContain('<a href="/sign-in"')
  })

  it('does not invite a seated player', () => {
    expect(watch({ viewer: ALICE, me: { id: ALICE } })).not.toContain('data-spectator-invite')
  })

  it('invites an account with a roster to start a battle', () => {
    expect(watch({ me: { id: 'reader' }, completedTasks: ['roster'] })).toContain('<a href="/battles"')
  })

  it('leaves an account that has played to watch', () => {
    expect(watch({ me: { id: 'reader' }, completedTasks: ['roster', 'battle'] })).not.toContain('data-spectator-invite')
  })
})
