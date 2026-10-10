import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { RosterPage } from './RosterPage'

vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: null }),
}))

it('shows an unavailable roster when access is revoked after its route loaded', () => {
  expect(renderToStaticMarkup(createElement(RosterPage, { id: 'roster', editable: false, snapshot: false }))).toContain(
    'This roster does not exist or you no longer have access to it.',
  )
})
