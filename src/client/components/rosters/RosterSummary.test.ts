import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SavedRoster } from './rosterLibrary'
import { RosterSummary } from './RosterSummary'

const roster = {
  id: 'roster-1',
  name: 'Cursed Legion',
  catalogueId: 'necrons',
  detachmentIds: ['awakened-dynasty'],
  disposition: null,
  limit: 2_000,
  createdAt: 0,
  updatedAt: 0,
  unitCount: 0,
  visibility: 'private',
  source: 'editable',
} satisfies SavedRoster

describe('roster summary', () => {
  it('shows the roster library details', () => {
    const markup = renderToStaticMarkup(
      createElement(RosterSummary, {
        roster,
        faction: {
          slug: 'necrons',
          displayName: 'Necrons',
          icon: null,
          detachments: [{ id: 'awakened-dynasty', name: 'Awakened Dynasty' }],
        },
        points: 1_985,
      }),
    )

    expect(markup).toContain('Necrons')
    expect(markup).toContain('Awakened Dynasty')
    expect(markup).toContain('Strike Force')
    expect(markup).toContain('1985/2000')
    expect(markup).toContain('Private')
  })
})
