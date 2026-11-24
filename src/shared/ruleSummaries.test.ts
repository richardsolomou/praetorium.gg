import { expect, it } from 'vitest'
import type { RuleSummary } from '../contracts/rules'
import { abilityKeysNamed, summaryNamedBy, summaryPlainText } from './ruleSummaries'

const summary = (text: string): RuleSummary => ({ blocks: [{ paragraph: [{ text }] }], questions: [] })
const textOf = (found: { summary: RuleSummary } | null) =>
  found?.summary.blocks[0] && 'paragraph' in found.summary.blocks[0] ? found.summary.blocks[0].paragraph[0]?.text : null
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

it('reads words several abilities print alike as the one of the ability’s own name', () => {
  const alike = {
    records: { 'ability:sm.captain.relic-shield': summary('Relic shield.'), 'ability:sm.squad.storm-shield': summary('Storm shield.') },
    texts: { shield: ['ability:sm.captain.relic-shield', 'ability:sm.squad.storm-shield'] },
    entries: {},
  }
  expect(textOf(summaryNamedBy([token('shield')], new Map([['file', alike]]), 'Storm Shield'))).toBe('Storm shield.')
})

it('names no summary where no rule prints every line', () => {
  expect(summaryNamedBy([token('shared'), token('unknown')], new Map([['file', answer]]))).toBeNull()
})

it('reads a summary as plain text, its bold as plain and each list item on a line', () => {
  expect(
    summaryPlainText({
      blocks: [
        { paragraph: [{ text: 'Select ' }, { text: 'one', bold: true }, { text: ':' }] },
        { list: 'unordered', items: [[{ text: 'Advance.' }], [{ text: 'Fall Back.' }]] },
      ],
      questions: [],
    }),
  ).toBe('Select one:\n\n• Advance.\n• Fall Back.')
})

it('names a core ability that takes a value by its name alone too', () => {
  expect(abilityKeysNamed('Feel No Pain 5+')).toContain('core-ability:feel-no-pain')
})
