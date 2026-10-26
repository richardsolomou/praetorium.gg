import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoadoutOddsContext, LoadoutOddsStatus } from './LoadoutOdds'
import type { LoadoutOdds } from './useLoadoutOdds'

it('renders the worker error with a retry action', () => {
  const odds: LoadoutOdds = {
    error: 'The loadout comparison failed. Try again.',
    estimates: new Map(),
    profiles: new Map(),
    retry: () => {},
  }
  const markup = renderToStaticMarkup(createElement(LoadoutOddsContext.Provider, { value: odds }, createElement(LoadoutOddsStatus)))
  expect(markup).toMatch(/role="alert"[^>]*>The loadout comparison failed\. Try again\..*<button[^>]*>Retry<\/button>/)
})
