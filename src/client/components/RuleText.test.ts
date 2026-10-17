import { type PropsWithChildren, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { RuleText } from './RuleText'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: PropsWithChildren) => createElement('a', null, children),
}))

// These render a reader who has chosen to load rules text; `RuleText.test.ts` covers one who has not.
vi.mock('../rulesText', async (original) => {
  const actual = await original<typeof import('../rulesText')>()
  return { ...actual, useTextSourceChoice: vi.fn(() => actual.textSourceChoiceFrom('bsdata,game-datacards')) }
})

it('renders nested Markdown lists indented with non-breaking spaces', () => {
  const markup = renderToStaticMarkup(createElement(RuleText, { text: '- First step\n \u00a0  - Nested step' }))
  expect([...markup.matchAll(/<ul\b/g)]).toHaveLength(2)
})

it('shows rules text the reader has not chosen to load as the choice to load it', async () => {
  const { useTextSourceChoice, textSourceChoiceFrom } = await import('../rulesText')
  vi.mocked(useTextSourceChoice).mockReturnValueOnce(textSourceChoiceFrom('game-datacards'))
  const markup = renderToStaticMarkup(createElement(RuleText, { text: 'Re-roll a Hit roll of 1.' }))
  expect(markup).not.toContain('Re-roll')
})

it('names BSData as the source of words the app holds untokenized', async () => {
  const { useTextSourceChoice, textSourceChoiceFrom } = await import('../rulesText')
  vi.mocked(useTextSourceChoice).mockReturnValueOnce(textSourceChoiceFrom('game-datacards'))
  expect(renderToStaticMarkup(createElement(RuleText, { text: 'Re-roll a Hit roll of 1.' }))).toContain('BSData text isn’t loaded.')
})

it('shows words the app writes to every reader', async () => {
  const { useTextSourceChoice, textSourceChoiceFrom } = await import('../rulesText')
  vi.mocked(useTextSourceChoice).mockReturnValueOnce(textSourceChoiceFrom(''))
  expect(renderToStaticMarkup(createElement(RuleText, { text: 'Score 2 VP.', authored: true }))).toContain('Score 2 VP.')
})
