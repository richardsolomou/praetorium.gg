import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { reduceBattle } from '../../../core/battle'
import type { Command } from '../../../core/battle'
import { ALICE, BOB, log, NAMES, started } from '../../../core/battle.fixtures'
import { battleClock } from '../../../core/battleClock'
import { battleView } from '../../../core/battleView'
import { deploymentsQuery } from '../../queries'
import { Spectator } from './Spectator'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: PropsWithChildren) => createElement('a', null, children),
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
