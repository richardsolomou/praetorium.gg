import { expect, it } from 'vitest'
import { ruleMarkdown } from './components/RuleText'

it('keeps the words the catalogue underlined without printing the tag', () => {
  expect(ruleMarkdown('- <ins>Or:</ins> With -2 to that **battle-shock roll**.')).toBe('- Or: With -2 to that **battle-shock roll**.')
})

it('marks a bracketed weapon ability so the page can link it', () => {
  expect(ruleMarkdown('Ranged weapons have [LETHAL HITS].')).toBe('Ranged weapons have **[LETHAL HITS]**.')
})
