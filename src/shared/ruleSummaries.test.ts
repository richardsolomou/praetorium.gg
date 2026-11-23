import { expect, it } from 'vitest'
import type { RuleSummary } from '../contracts/rules'
import { summaryNamedBy } from './ruleSummaries'

const summary = (text: string): RuleSummary => ({ blocks: [{ paragraph: [{ text }] }], questions: [] })
const textOf = (found: RuleSummary | null) =>
  found?.blocks[0] && 'paragraph' in found.blocks[0] ? found.blocks[0].paragraph[0]?.text : null
const answer = {
  records: { 'ability:a': summary('First stratagem.'), 'ability:b': summary('Second stratagem.') },
  texts: { shared: ['ability:a', 'ability:b'], own: ['ability:b'] },
  entries: {},
}
const token = (hash: string) => ({ file: 'file', transform: 'prose' as const, hash })

it('finds a stratagem by its own lines when another shares its timing', () => {
  expect(textOf(summaryNamedBy([token('shared'), token('own')], new Map([['file', answer]])))).toBe('Second stratagem.')
})

it('reads words several rules print alike as the first one’s summary', () => {
  expect(textOf(summaryNamedBy([token('shared')], new Map([['file', answer]])))).toBe('First stratagem.')
})

it('names no summary where no rule prints every line', () => {
  expect(summaryNamedBy([token('shared'), token('unknown')], new Map([['file', answer]]))).toBeNull()
})
