import { type PropsWithChildren, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { FactionAbilities } from './FactionPage'
import { ruleSummariesQuery, ruleUnitsQuery } from '../../../queries/references'
import type { VsDataUnits } from '../../../../shared/vsData'

vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  Link: ({ children }: PropsWithChildren) => createElement('a', null, children),
}))

it('explains an army rule the catalogue prints by the faction’s own VS Data record', () => {
  const client = new QueryClient()
  const units: VsDataUnits = {
    units: {},
    aliases: {},
    abilities: {
      'orks.waaagh': { blocks: [{ paragraph: [{ text: 'Once per battle, call the Waaagh!' }] }], questions: [] },
      'world-eaters.waaagh': { blocks: [{ paragraph: [{ text: 'Another faction’s rule of the name.' }] }], questions: [] },
    },
  }
  client.setQueryData(ruleUnitsQuery(null).queryKey, units)
  client.setQueryData(ruleSummariesQuery('2df30069').queryKey, { records: {}, texts: {}, entries: {} })
  const markup = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(FactionAbilities, {
        faction: { id: 'orks-catalogue', displayName: 'Orks' },
        rules: [{ name: 'Waaagh!', description: '⟦2df30069:plain:47ec78527ac7a330⟧' }],
      }),
    ),
  )
  expect(markup).toContain('Once per battle, call the Waaagh!')
})
