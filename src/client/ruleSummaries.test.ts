import { expect, it } from 'vitest'
import type { RuleSummary } from '../contracts/rules'
import { summaryNamedBy } from './ruleSummaries'

const summary = (text: string): RuleSummary => ({ summary: text, spans: [], citation: null, questions: [] })
const answer = {
  records: { 'ability:a': summary('First stratagem.'), 'ability:b': summary('Second stratagem.') },
  texts: { shared: ['ability:a', 'ability:b'], own: ['ability:b'] },
  entries: {},
}
const token = (hash: string) => ({ file: 'file', transform: 'prose' as const, hash })

it('finds a stratagem by its own lines when another shares its timing', () => {
  expect(summaryNamedBy([token('shared'), token('own')], new Map([['file', answer]]))?.summary).toBe('Second stratagem.')
})

it('names no summary for a line several rules print alone', () => {
  expect(summaryNamedBy([token('shared')], new Map([['file', answer]]))).toBeNull()
})
