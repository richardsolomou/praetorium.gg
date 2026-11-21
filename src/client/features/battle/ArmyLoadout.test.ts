import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { UnitState } from '../../../core/battle'
import type { Army } from '../../sides'
import { setupPriceQuery } from '../../queries'
import { ArmyLoadout, standingWargear, standingWargearCounts } from './ArmyLoadout'

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
    const request = setupPriceQuery({ ...built, detachmentIds: [], fielded: { at: undefined } }, built.picks)
    queryClient.setQueryData(request.queryKey, { units: [] } as never)

    const markup = renderToStaticMarkup(
      createElement(QueryClientProvider, { client: queryClient }, createElement(ArmyLoadout, { army, unit })),
    )

    expect(markup).toContain('5× Plague knife')
  })
})

describe('wargear in a battle with casualties', () => {
  const vanguard = {
    ...unit,
    name: 'Skitarii Vanguard',
    models: 10,
    modelLines: [
      { name: 'Skitarii Vanguard Alpha', models: 1, wargear: [{ name: 'Radium carbine', count: 1 }] },
      { name: 'Skitarii Vanguard', models: 8, wargear: [{ name: 'Radium carbine', count: 8 }] },
      {
        name: 'Omnispex',
        models: 1,
        wargear: [
          { name: 'Radium carbine', count: 1 },
          { name: 'Omnispex', count: 1 },
        ],
      },
    ],
    lines: [
      { alive: 1, damage: 0 },
      { alive: 8, damage: 0 },
      { alive: 0, damage: 0 },
    ],
  } as UnitState

  it('counts only what the models still standing carry', () => {
    expect(standingWargear(vanguard)?.left((piece) => piece === 'Radium carbine')).toBe(9)
  })
})

describe('a unit card in a battle with casualties', () => {
  it('leaves out wargear no model still standing carries', () => {
    const vanguard = {
      ...unit,
      models: 2,
      wargear: [
        { name: 'Radium carbine', count: 2 },
        { name: 'Omnispex', count: 1 },
      ],
      modelLines: [
        { name: 'Skitarii Vanguard', models: 1, wargear: [{ name: 'Radium carbine', count: 1 }] },
        {
          name: 'Omnispex',
          models: 1,
          wargear: [
            { name: 'Radium carbine', count: 1 },
            { name: 'Omnispex', count: 1 },
          ],
        },
      ],
      lines: [
        { alive: 1, damage: 0 },
        { alive: 0, damage: 0 },
      ],
    } as UnitState
    expect(standingWargearCounts(vanguard)).toEqual([{ name: 'Radium carbine', count: 1 }])
  })
})
