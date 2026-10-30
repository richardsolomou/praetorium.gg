import { type PropsWithChildren, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { RuleText, ruleMarkdown, ruleSegments } from './RuleText'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: PropsWithChildren) => createElement('a', null, children),
}))

// A reader who has chosen to load rules text unless a test says otherwise.
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

it('shows words the app writes to every reader', async () => {
  const { useTextSourceChoice, textSourceChoiceFrom } = await import('../rulesText')
  vi.mocked(useTextSourceChoice).mockReturnValueOnce(textSourceChoiceFrom(''))
  expect(renderToStaticMarkup(createElement(RuleText, { text: 'Score 2 VP.', authored: true }))).toContain('Score 2 VP.')
})

it('keeps the words the catalogue underlined without printing the tag', () => {
  expect(ruleMarkdown('- <ins>Or:</ins> With -2 to that **battle-shock roll**.')).toBe('- Or: With -2 to that **battle-shock roll**.')
})

it('marks a bracketed weapon ability so the page can link it', () => {
  expect(ruleMarkdown('Ranged weapons have [LETHAL HITS].')).toBe('Ranged weapons have **[LETHAL HITS]**.')
})

it('marks a bracketed weapon ability with a target restriction', () => {
  expect(ruleMarkdown('Attacks have [SUSTAINED HITS 1: non-MONSTER/VEHICLE].')).toBe(
    'Attacks have **[SUSTAINED HITS 1: non-MONSTER/VEHICLE]**.',
  )
})

it('keeps a table whole and reads the words around it as markdown', () => {
  expect(ruleSegments('Roll one D6:\n<table>\n<tr><td>D6</td><td>Result</td></tr>\n</table>\nThen **fight**.')).toEqual([
    { kind: 'markdown', text: 'Roll one D6:\n' },
    { kind: 'table', text: '<table>\n<tr><td>D6</td><td>Result</td></tr>\n</table>' },
    { kind: 'markdown', text: '\nThen **fight**.' },
  ])
})
