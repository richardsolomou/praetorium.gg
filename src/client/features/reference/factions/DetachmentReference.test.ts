import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { DetachmentReference } from './DetachmentReference'

it('ends loading when an offered detachment has no reference result', () => {
  const client = new QueryClient()
  client.setQueryData(['detachment-detail', 'chapter', 'missing'], null)
  const markup = renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(DetachmentReference, { catalogueId: 'chapter', slug: 'missing' })),
  )

  expect(markup).toContain('Detachment reference unavailable')
})
