import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { RuleText } from './RuleText'

it('renders nested Markdown lists indented with non-breaking spaces', () => {
  const markup = renderToStaticMarkup(createElement(RuleText, { text: '- First step\n \u00a0  - Nested step' }))
  expect([...markup.matchAll(/<ul\b/g)]).toHaveLength(2)
})
