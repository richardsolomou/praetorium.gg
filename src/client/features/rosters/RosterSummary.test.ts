import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SavedRoster } from './rosterLibrary'
import { RosterSummary } from './RosterSummary'

const roster = {
  id: 'roster-1',
  name: 'Cursed Legion',
  automaticName: false,
  catalogueId: 'necrons',
  detachmentIds: ['awakened-dynasty'],
  disposition: null,
  limit: 2_000,
  pointsBudget: null,
  createdAt: 0,
  updatedAt: 0,
  unitCount: 0,
  visibility: 'private',
  source: 'editable',
  waivedRules: [],
  optionalRules: [],
  borrowedDetachmentId: null,
  baseRosterId: null,
  locked: false,
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

  it('shows a custom points budget beside the battle size whose limits still apply', () => {
    const markup = renderToStaticMarkup(createElement(RosterSummary, { roster: { ...roster, pointsBudget: 1_500 }, points: 1_485 }))

    expect([markup.includes('1485/1500'), markup.includes('Strike Force · 1500-point budget')]).toEqual([true, true])
  })

  it('shows the selected force disposition beside the detachment', () => {
    const markup = renderToStaticMarkup(
      createElement(RosterSummary, {
        roster: { ...roster, disposition: 'take-and-hold' },
        faction: {
          slug: 'necrons',
          displayName: 'Necrons',
          icon: null,
          detachments: [{ id: 'awakened-dynasty', name: 'Awakened Dynasty' }],
        },
        dispositionName: 'Take and Hold',
      }),
    )

    expect(markup).toContain('Take and Hold')
  })

  it('names a published roster rather than labelling it as another kind of share', () => {
    const markup = renderToStaticMarkup(createElement(RosterSummary, { roster: { ...roster, visibility: 'public' } }))

    expect(markup).toContain('Public')
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

  describe('for somebody deciding whether to copy it', () => {
    const published = { ...roster, visibility: 'public' as const }
    const markup = (props: { points?: number | null; problem?: 'not-legal' | null }) =>
      renderToStaticMarkup(createElement(RosterSummary, { roster: published, showLegality: true, ...props }))

    it('says a priced roster without a problem is legal', () => {
      expect(markup({ points: 1_985 })).toContain('Legal')
    })

    it('says why a roster cannot be fielded', () => {
      expect(markup({ points: 1_985, problem: 'not-legal' })).toContain('Not legal')
    })

    it('calls an unpriced roster neither legal nor illegal', () => {
      expect(markup({ points: null })).not.toMatch(/Legal|Not legal/)
    })

    it('leaves out who can read the roster', () => {
      expect(markup({ points: 1_985 })).not.toContain('Public')
    })
  })
})
