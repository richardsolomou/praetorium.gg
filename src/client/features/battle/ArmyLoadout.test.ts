import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { UnitState } from '../../../core/battle'
import type { Army } from '../../sides'
import { priceQuery } from '../../queries'
import { ArmyLoadout } from './ArmyLoadout'

const unit = {
  key: '0-retired-entry',
  entryId: 'retired-entry',
  name: 'Plague Marines',
  points: 90,
  models: 5,
  wargear: [{ name: 'Plague knife', count: 5 }],
  destroyed: false,
  deployed: true,
  formation: 'battlefield',
} as UnitState
const built = {
  catalogueId: 'death-guard',
  revision: 'abc',
  limit: 2_000,
  detachment: null,
  disposition: null,
  detachmentIds: [],
  picks: [{ entryId: 'retired-entry', models: 5 }],
  units: [unit],
}
const army = { roster: { name: 'Fielded', text: '', built }, units: [unit] } as unknown as Army

describe('a fielded unit in battle', () => {
  it('shows what the list recorded when its rules version can no longer build it', () => {
    const queryClient = new QueryClient()
    const request = priceQuery(built.catalogueId, [], null, built.limit, built.picks, [], null, [], false, true)
    queryClient.setQueryData(request.queryKey, { units: [] } as never)

    const markup = renderToStaticMarkup(
      createElement(QueryClientProvider, { client: queryClient }, createElement(ArmyLoadout, { army, unit })),
    )

    expect(markup).toContain('5× Plague knife')
  })
})
