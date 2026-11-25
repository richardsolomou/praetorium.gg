import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type PropsWithChildren, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { detachmentDetailQuery, ruleUnitsQuery } from '../../../queries/references'
import { DetachmentReference } from './DetachmentReference'

vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: PropsWithChildren) => createElement('a', null, children) }))

it('ends loading when an offered detachment has no reference result', () => {
  const client = new QueryClient()
  client.setQueryData(['detachment-detail', 'chapter', 'missing'], null)
  const markup = renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(DetachmentReference, { catalogueId: 'chapter', slug: 'missing' })),
  )

  expect(markup).toContain('Detachment reference unavailable')
})

it('shows a Stratagem the build has only in its app by its release’s summary', () => {
  const client = new QueryClient()
  const stratagem = {
    id: 'space-marines.stormlance-task-force.full-throttle',
    name: 'Full Throttle',
    cp: 2,
    type: 'Wargear',
    phases: [],
    turn: null,
    description: null,
  }
  const detailKey: readonly unknown[] = detachmentDetailQuery('cat', 'stormlance-task-force').queryKey
  client.setQueryData(detailKey, {
    name: 'Stormlance Task Force',
    points: null,
    dispositions: [],
    rules: [],
    enhancements: [],
    upgrades: [],
    stratagems: [stratagem],
    keywordRules: [],
  })
  client.setQueryData(ruleUnitsQuery(null).queryKey, {
    units: {},
    aliases: {},
    abilities: { [stratagem.id]: { blocks: [{ paragraph: [{ text: 'Move further this turn.' }] }], questions: [] } },
  })
  const markup = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(DetachmentReference, { catalogueId: 'cat', slug: 'stormlance-task-force' }),
    ),
  )
  expect(markup).toContain('Move further this turn.')
})
