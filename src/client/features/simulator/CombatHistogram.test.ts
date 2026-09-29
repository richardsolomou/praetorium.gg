import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { CombatHistogram, atLeastProbabilities } from './CombatHistogram'

it('includes every outcome at or above each threshold', () => {
  expect(atLeastProbabilities([0.1, 0.2, 0.3, 0.4]).map((chance) => chance.toFixed(1))).toEqual(['1.0', '0.9', '0.7', '0.4'])
})

it('keeps an impossible threshold at zero', () => {
  expect(atLeastProbabilities([1, 0, 0])).toEqual([1, 0, 0])
})

it('shows the chance of losing at least one model even when none can be lost', () => {
  const markup = renderToStaticMarkup(createElement(CombatHistogram, { distribution: [1] }))
  expect(markup).toContain('>1</span>')
})

it('omits the certain zero threshold', () => {
  const markup = renderToStaticMarkup(createElement(CombatHistogram, { distribution: [0.5, 0.5] }))
  expect(markup).not.toContain('>0</span>')
})
