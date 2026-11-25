import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { SpecialChoice } from './LoadoutControls'
import { ruleSummariesQuery, ruleUnitsQuery } from '../../../queries/references'
import type { VsDataUnits } from '../../../../shared/vsData'

const said = (text: string) => ({ blocks: [{ paragraph: [{ text }] }], questions: [] })
const owners = {
  support: 'marines-catalogue#@space-marines.deathwatch-support',
  spear: 'marines-catalogue#@deathwatch.black-spear-task-force',
}
const choice = (option: { description?: string }) => ({
  key: 'enhancements',
  name: 'Enhancements',
  chosen: 'beacon',
  optional: true,
  carried: true,
  room: 1,
  uniform: true,
  owner: null,
  kind: 'enhancement' as const,
  options: [{ id: 'beacon', name: 'Beacon Angelis', points: 25, count: 1, min: 0, max: 1, detachment: 'spear', ...option }],
})
const shown = (option: { description?: string }) => {
  const client = new QueryClient()
  const units: VsDataUnits = {
    units: {},
    aliases: {},
    abilities: {
      'space-marines.deathwatch-support.beacon-angelis': said('Deathwatch Support beacon.'),
      'deathwatch.black-spear-task-force.beacon-angelis': said('Black Spear beacon.'),
    },
  }
  client.setQueryData(ruleUnitsQuery(null).queryKey, units)
  client.setQueryData(ruleSummariesQuery('2df30069').queryKey, { records: {}, texts: {}, entries: {} })
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(SpecialChoice, {
        choice: choice(option),
        unitName: 'Captain',
        editable: false,
        onChoose: () => {},
        detachmentRuleOwners: owners,
      }),
    ),
  )
}

it('explains an enhancement by the record of the list’s detachment it belongs to, not another detachment’s of that name', () => {
  const markup = shown({ description: '⟦2df30069:plain:47ec78527ac7a330⟧' })
  expect([markup.includes('Black Spear beacon.'), markup.includes('Deathwatch Support beacon.')]).toEqual([true, false])
})

it('explains an enhancement the catalogue prints no text for by its detachment’s record', () =>
  expect(shown({})).toContain('Black Spear beacon.'))
