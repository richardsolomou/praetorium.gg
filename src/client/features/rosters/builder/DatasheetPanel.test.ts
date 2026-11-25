import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { AbilitySummary } from './DatasheetPanel'
import { DatasheetUnit } from '../../../components/UnitFromVsData'
import { ruleSummariesQuery, ruleUnitsQuery } from '../../../queries/references'
import type { VsDataUnits } from '../../../../shared/vsData'

it('explains a unit’s ability that the list’s detachment gives it by that detachment’s rule', () => {
  const client = new QueryClient()
  const units: VsDataUnits = {
    units: { eightbound: { id: 'world-eaters.eightbound', sizes: [], models: [], options: [] } },
    aliases: {},
    abilities: {
      'world-eaters.possessed-slaughterband.brazen-fury': { blocks: [{ paragraph: [{ text: 'The detachment’s fury.' }] }], questions: [] },
    },
  }
  client.setQueryData(ruleUnitsQuery(null).queryKey, units)
  client.setQueryData(ruleSummariesQuery('2df30069').queryKey, { records: {}, texts: {}, entries: {} })
  const text = '⟦2df30069:plain:47ec78527ac7a330⟧'
  const markup = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        DatasheetUnit.Provider,
        { value: 'world-eaters-catalogue#eightbound' },
        createElement(AbilitySummary, {
          abilities: [{ id: 'brazen', kind: 'datasheet', name: 'Brazen Fury', description: text }],
          rules: [],
          detachmentRules: [{ id: 'slaughterband/brazen-fury', kind: 'detachment', name: 'Brazen Fury', description: text }],
          detachmentRuleOwners: { slaughterband: 'world-eaters-catalogue#@world-eaters.possessed-slaughterband' },
        }),
      ),
    ),
  )
  expect(markup).toContain('The detachment’s fury.')
})
