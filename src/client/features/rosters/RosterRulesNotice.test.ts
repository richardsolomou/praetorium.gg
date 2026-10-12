import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { RosterRulesNotice } from './RosterRulesNotice'

it('explains that a preserved roster needs checking against current rules without calling it illegal', () => {
  const markup = renderToStaticMarkup(createElement(RosterRulesNotice, { edition: { name: 'Original rules', status: 'retired' } }))
  expect(markup).toContain('This roster uses Original rules. Convert rules version to check current points and legality.')
})

it('names the current rules when a roster keeps an earlier released version', () => {
  const markup = renderToStaticMarkup(
    createElement(RosterRulesNotice, { edition: { name: 'Codex · 3 Oct', status: 'released' }, current: 'Codex · 12 Oct' }),
  )
  expect(markup).toContain(
    'This roster uses Codex · 3 Oct. Codex · 12 Oct is the current rules version. Convert rules version to review points and legality changes.',
  )
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
