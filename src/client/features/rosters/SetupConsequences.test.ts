import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { SetupConsequences } from './SetupConsequences'
import type { RosterSetupReview } from './rosterSetupReview'

const draft = { catalogueId: 'cat', limit: 1000, picks: [{ entryId: 'scouts' }], waivedRules: [], name: 'Scouts', visibility: 'private' }
const price = (points: number) => ({
  points,
  detachments: [],
  errors: [],
  unhandled: [],
  units: [{ key: 0, name: 'Scout Squad', points, size: { models: 5 }, choices: [], enhancements: [], upgrades: [] }],
})

function render(before: number, after: number) {
  const review = { source: draft, candidate: draft, before: price(before), after: price(after) } as unknown as RosterSetupReview
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, createElement(SetupConsequences, { review, guest: false })),
  ).replace(/<!-- -->/g, '')
}

it('shows how a unit’s points change under the new rules', () => {
  expect(render(60, 65)).toMatch(/Scout Squad · 5 models · <span[^>]*>60 → 65 pts<\/span>/)
})

it('shows a unit’s points once when the new rules keep them', () => {
  expect(render(65, 65)).toMatch(/Scout Squad · 5 models · <span[^>]*>65 pts<\/span>/)
})
