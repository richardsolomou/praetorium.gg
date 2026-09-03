import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Loadout } from './Loadout'

describe('loadout loading state', () => {
  it('does not ask for a selection while the selected unit is resolving', () => {
    const queryClient = new QueryClient()
    const markup = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Loadout, {
          catalogueId: 'catalogue',
          unit: null,
          loading: true,
          detachmentIds: [],
          picks: [{ entryId: 'unit' }],
          pickIndex: 0,
          onChoose: () => undefined,
          onSpread: () => undefined,
        }),
      ),
    )

    expect(markup).toContain('aria-label="Loading loadout"')
    expect(markup).not.toContain('Select a unit from the roster')
  })
})
