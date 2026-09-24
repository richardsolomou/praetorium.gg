import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { UnitCard } from './UnitCard'

it('shows a minor alert marker on a unit card', () => {
  const markup = renderToStaticMarkup(
    createElement(UnitCard, {
      unit: {
        entryId: 'plasmancer',
        name: 'Plasmancer',
        points: 55,
        wargear: [],
        attachment: null,
        enhancements: [],
        upgrades: [],
      },
      selected: false,
      editable: false,
      alertCount: 2,
    }),
  )

  expect(markup).toContain('2 alerts set for Plasmancer')
})
