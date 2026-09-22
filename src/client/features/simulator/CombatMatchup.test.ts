import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { CombatMatchup, type CombatantSnapshot } from './CombatMatchup'

it('does not promise an ongoing calculation when neither phase can be simulated', () => {
  const unit: CombatantSnapshot = {
    models: 1,
    carriers: [],
    sheet: {
      id: 'unit',
      slug: 'unit',
      name: 'Unit',
      referenceRoute: null,
      points: null,
      keywords: [],
      profiles: [
        {
          id: 'model',
          name: 'Model',
          type: 'Unit',
          values: [
            { name: 'T', value: '4' },
            { name: 'Sv', value: '3+' },
            { name: 'W', value: '2' },
          ],
        },
      ],
      abilities: [],
      composition: [],
      loadout: null,
      wargearOptions: [],
      baseSize: null,
      transport: null,
      costs: [],
      attachments: [],
      leaders: [],
      supporters: [],
      keywordRules: [],
    },
  }
  const markup = renderToStaticMarkup(createElement(CombatMatchup, { attacker: unit, defender: unit }))
  expect([...markup.matchAll(/aria-label="(?:Shooting|Melee) results" aria-busy="([^"]+)"/g)].map((match) => match[1])).toEqual([
    'false',
    'false',
  ])
})
