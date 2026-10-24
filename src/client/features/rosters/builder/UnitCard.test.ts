import { type ComponentProps, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { UnitCard } from './UnitCard'

const card = (props: Partial<ComponentProps<typeof UnitCard>> = {}) =>
  renderToStaticMarkup(
    createElement(UnitCard, {
      unit: { entryId: 'rhino', name: 'Rhino', points: 75, wargear: [], attachment: null, enhancements: [], upgrades: [] },
      selected: false,
      ...props,
    }),
  )

const RHINO_BOARDING = { passenger: 0, transport: 1, name: 'Rhino', detail: '0/12 models', reason: null }
const ABOARD = { label: 'Embarked', name: 'Intercessor Squad', detail: '5/12 models', action: 'Disembark' }

it('shows a minor alert marker on a unit card', () => {
  expect(
    card({
      unit: { entryId: 'plasmancer', name: 'Plasmancer', points: 55, wargear: [], attachment: null, enhancements: [], upgrades: [] },
      editable: false,
      alertCount: 2,
    }),
  ).toContain('2 alerts set for Plasmancer')
})

it('offers a passenger the transports it can board', () => {
  expect(card({ canBoard: [RHINO_BOARDING] })).toContain('Embark in transport')
})

it('offers a transport the units it can carry', () => {
  expect(card({ canCarry: [RHINO_BOARDING] })).toContain('Embark unit')
})

it('offers no embarking on a card that cannot be edited', () => {
  expect(card({ canBoard: [RHINO_BOARDING], editable: false })).not.toContain('Embark in transport')
})

it('says how much room a passenger takes', () => {
  expect(card({ joined: [ABOARD] })).toContain('5/12 models')
})

it('keeps a passenger row without its action when read only', () => {
  expect(card({ joined: [ABOARD], editable: false })).not.toContain('Disembark')
})
