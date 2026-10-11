import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { RosterRulesNotice } from './RosterRulesNotice'

it('explains that a preserved roster needs checking against current rules without calling it illegal', () => {
  const markup = renderToStaticMarkup(createElement(RosterRulesNotice, { edition: { name: 'Original rules', status: 'retired' } }))
  expect(markup).toContain('This roster uses Original rules. Convert rules version to check current points and legality.')
})

it.each(['released', 'preview'] as const)('does not label %s rules as previous rules', (status) => {
  expect(renderToStaticMarkup(createElement(RosterRulesNotice, { edition: { name: 'Codex', status } }))).toBe('')
})

it('offers owners the existing conversion action', () => {
  const markup = renderToStaticMarkup(
    createElement(RosterRulesNotice, { edition: { name: 'Original rules', status: 'retired' }, onConvert: () => {} }),
  )
  expect(markup).toMatch(/<button[^>]*>Convert rules version<\/button>/)
})
