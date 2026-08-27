import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BattleRosterSnapshot } from './BattleRosterSnapshot'

describe('battle roster snapshot', () => {
  it('shows a text-only roster without a faction loader', () => {
    const queryClient = new QueryClient()
    const markup = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(BattleRosterSnapshot, { roster: { name: 'Imported roster', text: 'Imported army list' } }),
      ),
    )

    expect(markup).toContain('Imported army list')
    expect(markup).not.toContain('Loading faction')
  })
})
