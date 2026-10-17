import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { RuleText } from './RuleText'

// These render a reader who has chosen to load rules text; `RuleText.test.ts` covers one who has not.
vi.mock('../rulesText', async (original) => ({
  ...(await original<typeof import('../rulesText')>()),
  useRulesTextChoice: vi.fn(() => true),
}))

it('renders nested Markdown lists indented with non-breaking spaces', () => {
  const markup = renderToStaticMarkup(createElement(RuleText, { text: '- First step\n \u00a0  - Nested step' }))
  expect([...markup.matchAll(/<ul\b/g)]).toHaveLength(2)
})

it('shows rules text the reader has not chosen to load as the choice to load it', async () => {
  const { useRulesTextChoice } = await import('../rulesText')
  vi.mocked(useRulesTextChoice).mockReturnValueOnce(false)
  const markup = renderToStaticMarkup(createElement(RuleText, { text: 'Re-roll a Hit roll of 1.' }))
  expect(markup).not.toContain('Re-roll')
})

it('shows words the app writes to every reader', async () => {
  const { useRulesTextChoice } = await import('../rulesText')
  vi.mocked(useRulesTextChoice).mockReturnValueOnce(false)
  expect(renderToStaticMarkup(createElement(RuleText, { text: 'Score 2 VP.', authored: true }))).toContain('Score 2 VP.')
})
