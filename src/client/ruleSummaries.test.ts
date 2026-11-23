import { expect, it } from 'vitest'
import type { RuleSummary } from '../contracts/rules'
import { summaryNamedBy } from './ruleSummaries'

const summary = (text: string): RuleSummary => ({ summary: text, spans: [], questions: [] })
const answer = {
  records: { 'ability:a': summary('First stratagem.'), 'ability:b': summary('Second stratagem.') },
  texts: { shared: ['ability:a', 'ability:b'], own: ['ability:b'] },
  entries: {},
}
const token = (hash: string) => ({ file: 'file', transform: 'prose' as const, hash })

it('finds a stratagem by its own lines when another shares its timing', () => {
  expect(summaryNamedBy([token('shared'), token('own')], new Map([['file', answer]]))?.summary).toBe('Second stratagem.')
})

it('reads words several rules print alike as the first one’s summary', () => {
  expect(summaryNamedBy([token('shared')], new Map([['file', answer]]))?.summary).toBe('First stratagem.')
})

it('names no summary where no rule prints every line', () => {
  expect(summaryNamedBy([token('shared'), token('unknown')], new Map([['file', answer]]))).toBeNull()
})
