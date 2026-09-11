import { expect, it } from 'vitest'
import { ruleMarkdown, ruleSegments } from './components/RuleText'

it('keeps the words the catalogue underlined without printing the tag', () => {
  expect(ruleMarkdown('- <ins>Or:</ins> With -2 to that **battle-shock roll**.')).toBe('- Or: With -2 to that **battle-shock roll**.')
})

it('marks a bracketed weapon ability so the page can link it', () => {
  expect(ruleMarkdown('Ranged weapons have [LETHAL HITS].')).toBe('Ranged weapons have **[LETHAL HITS]**.')
})

it('keeps a table whole and reads the words around it as markdown', () => {
  expect(ruleSegments('Roll one D6:\n<table>\n<tr><td>D6</td><td>Result</td></tr>\n</table>\nThen **fight**.')).toEqual([
    { kind: 'markdown', text: 'Roll one D6:\n' },
    { kind: 'table', text: '<table>\n<tr><td>D6</td><td>Result</td></tr>\n</table>' },
    { kind: 'markdown', text: '\nThen **fight**.' },
  ])
})
