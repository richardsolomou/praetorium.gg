import { type ComponentProps, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { NO_EMBARK } from './builder/embarkModel'
import { AttachedUnitActions } from './RosterUnitCard'

const outline = (props: Partial<ComponentProps<typeof AttachedUnitActions>> = {}) =>
  renderToStaticMarkup(
    createElement(AttachedUnitActions, { host: 0, name: 'Intercessor Squad', embark: NO_EMBARK, canHost: [], editable: true, ...props }),
  )

const ABOARD = { ...NO_EMBARK, ridesIn: { label: 'Embarked in', name: 'Rhino', action: 'Remove', passenger: 0 } }
const BOARDABLE = { ...NO_EMBARK, canBoard: [{ passenger: 0, transport: 1, name: 'Rhino', detail: '0/12 models', reason: null }] }
const CAPTAIN = { kind: 'roster' as const, key: 2, name: 'Captain' }

it('names the transport the whole unit starts in', () => {
  expect(outline({ embark: ABOARD })).toContain('Unit embarked in')
})

it('offers to take the unit out of its transport', () => {
  expect(outline({ embark: ABOARD })).toContain('Remove')
})

it('keeps the unit’s transport without its action when read only', () => {
  expect(outline({ embark: ABOARD, editable: false })).not.toContain('Remove')
})

it('offers the unit the transports it can board', () => {
  expect(outline({ embark: BOARDABLE })).toContain('Embark unit in transport')
})

it('offers no boarding when read only', () => {
  expect(outline({ embark: BOARDABLE, editable: false })).toBe('')
})

it('offers a free attachment slot', () => {
  expect(outline({ canHost: [CAPTAIN] })).toContain('Attach unit')
})
