import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Roster } from '../../core/battle'
import { BattleRosterSnapshot, rosterReading } from './BattleRosterSnapshot'

const unit = (overrides: Partial<NonNullable<Roster['built']>['units'][number]> = {}) => ({
  key: 'a',
  name: 'Lord of Virulence',
  points: 110,
  models: 1,
  group: 'character' as const,
  ...overrides,
})

const built = (overrides: Partial<NonNullable<Roster['built']>> = {}): NonNullable<Roster['built']> => ({
  catalogueId: 'death-guard',
  revision: 'abc',
  limit: 2_000,
  detachment: 'Shamblerot Vectorium',
  disposition: null,
  units: [unit()],
  ...overrides,
})

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

describe('which reading a fielded roster gets', () => {
  it('prices a list that still points at a saved roster', () => {
    const reading = rosterReading({ id: 'saved', name: 'Fielded', text: '', built: built({ detachmentIds: ['x'], picks: [] }) })

    expect(reading).toEqual({ kind: 'roster' })
  })

  it('reads a list with no saved roster behind it as the units it was fielded with', () => {
    const reading = rosterReading({
      name: 'Pasted',
      text: '',
      built: built({ units: [unit({ points: 110 }), unit({ key: 'b', points: 90 })] }),
    })

    expect(reading).toEqual({
      kind: 'roster',
      frozen: {
        units: [unit({ points: 110 }), unit({ key: 'b', points: 90 })],
        points: 200,
        detachments: [{ name: 'Shamblerot Vectorium', points: null, id: undefined }],
      },
    })
  })

  it('reads a list whose frozen units name no shelf as text', () => {
    const reading = rosterReading({ name: 'Old log', text: 'Imported army list', built: built({ units: [unit({ group: undefined })] }) })

    expect(reading).toEqual({ kind: 'text' })
  })

  it('freezes a saved list that was attached without its selections', () => {
    const reading = rosterReading({ id: 'saved', name: 'Old log', text: '', built: built() })

    expect(reading).toMatchObject({ kind: 'roster', frozen: { points: 110 } })
  })
})
