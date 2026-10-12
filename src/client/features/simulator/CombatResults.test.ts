import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { CombatResults } from './CombatResults'

it.each([
  { selected: true, updating: true, failed: false, visible: true },
  { selected: false, updating: true, failed: false, visible: false },
  { selected: true, updating: false, failed: false, visible: false },
  { selected: true, updating: true, failed: true, visible: false },
])('shows updating only for a selected ongoing estimate ($selected/$updating/$failed)', ({ selected, updating, failed, visible }) => {
  const markup = renderToStaticMarkup(createElement(CombatResults, { selected, updating, failed, inDialog: false, supported: true }))
  expect(markup.includes('Updating…')).toBe(visible)
})
