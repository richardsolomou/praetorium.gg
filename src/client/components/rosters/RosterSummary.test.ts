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
  waivedRules: [],
  optionalRules: [],
  borrowedDetachmentId: null,
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
    expect(markup).not.toContain('switched off')
  })

  it('names the format restrictions a roster is not playing', () => {
    const markup = renderToStaticMarkup(
      createElement(RosterSummary, {
        roster: { ...roster, limit: 600, waivedRules: ['kotc-epic-heroes', 'kotc-toughness'] },
        points: 590,
      }),
    )

    // The mark itself is silent; the sentence it carries is what a reader is told.
    expect(markup).toContain('2 format restrictions switched off: No Epic Heroes, Toughness cap')
  })

  it('says nothing about a waiver its battle size does not impose', () => {
    const markup = renderToStaticMarkup(
      createElement(RosterSummary, { roster: { ...roster, waivedRules: ['kotc-epic-heroes'] }, points: 1_985 }),
    )

    expect(markup).not.toContain('switched off')
  })
})
