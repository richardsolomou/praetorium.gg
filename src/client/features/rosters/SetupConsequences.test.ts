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

function render(before: number, after: number, overrides: Record<string, unknown> = {}) {
  const review = {
    source: draft,
    candidate: draft,
    before: price(before),
    after: price(after),
    ...overrides,
  } as unknown as RosterSetupReview
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

it('omits unchanged setup values instead of repeating before and after', () => {
  expect(render(65, 65)).not.toMatch(/Battle size|Points limit|Visibility|Force disposition|Waived restrictions|Optional rules/)
})

it('collapses one unchanged unit by default', () => {
  expect(render(65, 65)).toMatch(/<details[^>]*><summary[^>]*>1 unchanged unit<\/summary>/)
})

it('does not offer an unchanged unit disclosure for an empty roster', () => {
  expect(render(0, 0, { source: { ...draft, picks: [] }, candidate: { ...draft, picks: [] } })).not.toContain('<details')
})

it('counts repeated unchanged units as separate roster entries', () => {
  const units = [price(65).units[0], { ...price(65).units[0], key: 1 }]
  const two = { ...draft, picks: [...draft.picks, ...draft.picks] }
  expect(render(130, 130, { source: two, candidate: two, before: { ...price(130), units }, after: { ...price(130), units } })).toContain(
    '>2 unchanged units</summary>',
  )
})

it('keeps a changed unit visible outside the unchanged disclosure', () => {
  expect(render(60, 65)).not.toContain('<details')
})

it('marks removed choices and their unit in red', () => {
  const source = { ...draft, picks: [{ entryId: 'scouts', choices: { relic: 'mark' } }] }
  const before = { ...price(65), units: [{ ...price(65).units[0], choices: [{ key: 'relic', options: [{ id: 'mark', name: 'Relic' }] }] }] }
  expect(render(65, 65, { source, before })).toMatch(/<li[^>]*text-destructive[^>]*>[\s\S]*Removed choices: Relic/)
})

it('places legality problems before the changed setup and units', () => {
  const html = render(1200, 1200, { candidate: { ...draft, limit: 600 } })
  expect(html).toMatch(/Over budget by 600 points\.[\s\S]*Battle size/)
})

it('does not warn about an explicitly waived points limit', () => {
  expect(render(1200, 1200, { candidate: { ...draft, waivedRules: ['points-limit'] } })).not.toContain('Over budget by')
})

it('keeps an unresolved entry visible in amber', () => {
  expect(render(65, 65, { after: { ...price(65), units: [] } })).toMatch(/<li[^>]*text-discarded[^>]*>[\s\S]*Needs review/)
})

it('shows changed visibility with both values', () => {
  expect(render(65, 65, { candidate: { ...draft, visibility: 'public' } })).toMatch(/Visibility[\s\S]*private[\s\S]*public/)
})

it('keeps a removed unit visible in red', () => {
  expect(render(65, 0, { candidate: { ...draft, picks: [] }, after: { ...price(0), units: [] } })).toMatch(
    /<li[^>]*text-destructive[^>]*>[\s\S]*Removed[\s\S]*Scout Squad/,
  )
})

it.each([
  { entryId: 'scouts', entryName: 'Other name' },
  { entryId: 'other-id', entryName: 'Scout Squad' },
])('keeps an illegal unit expanded when its error matches $entryId or $entryName', (entry) => {
  expect(render(65, 65, { after: { ...price(65), errors: [{ ...entry, message: 'Too many units' }] } })).toMatch(
    /<li[^>]*text-destructive[^>]*>[\s\S]*Illegal[\s\S]*Scout Squad/,
  )
})

it.each(['detachmentError', 'dispositionError', 'borrowedError'])('surfaces %s even when units are unchanged', (field) => {
  expect(render(65, 65, { after: { ...price(65), [field]: 'Invalid setup' } })).toMatch(
    /Needs attention[\s\S]*text-destructive[\s\S]*Invalid setup/,
  )
})

it('keeps unsupported checks visible in amber', () => {
  expect(render(65, 65, { after: { ...price(65), unhandled: ['Cannot check this restriction'] } })).toMatch(
    /text-discarded[^>]*>[\s\S]*Needs review[\s\S]*Cannot check this restriction/,
  )
})

it('does not show a clear legality result when a unit cannot be checked', () => {
  expect(render(65, 65, { after: { ...price(65), units: [] } })).not.toContain('No reported legality problems.')
})
