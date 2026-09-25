import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { ReportEntry } from '../../../core/battleReport'
import { formatDate } from '../../dates'
import { Report } from './Report'

it('shows the dates of events on different days in the battle report', () => {
  const first = new Date(2026, 0, 2, 12)
  const second = new Date(2026, 0, 3, 12)
  const entry = (seq: number, at: Date): ReportEntry => ({
    seq,
    at: at.getTime(),
    round: 1,
    phase: 'command',
    by: 'alice',
    commandKind: 'configure-battle',
    text: `Event ${seq}`,
  })
  const markup = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(Report, { token: 'battle', open: true, entries: [entry(1, first), entry(2, second)] }),
    ),
  )

  expect(markup).toContain(formatDate(first))
  expect(markup).toContain(formatDate(second))
})
