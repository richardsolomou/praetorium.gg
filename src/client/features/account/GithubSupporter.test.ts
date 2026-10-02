import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { githubSponsorshipQuery } from '../../queries'
import { GithubSupporter } from './GithubSupporter'

it('shows a linked sponsor result and refresh control inside the sign-in methods card', () => {
  const client = new QueryClient()
  client.setQueryData(githubSponsorshipQuery().queryKey, { available: true, linked: true, sponsorship: 'public' })

  const html = renderToString(createElement(QueryClientProvider, { client }, createElement(GithubSupporter)))

  expect(html).toContain('Public sponsor. Your profile shows the Supporter badge.')
  expect(html).toContain('aria-label="Refresh sponsorship status"')
  expect(html).not.toContain('<section')
})
