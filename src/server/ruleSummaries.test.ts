import { expect, it } from 'vitest'
import { ruleSummaryIndex, ruleSummaryIn, withoutOriginalWording } from './ruleSummaries'

const digest = 'cd8f1ca96df6f682a0c6c31a9f19915fe2e21b924cc95e3cfe0514011d0a6f48'

it('only resolves the wording the summary was checked against', () => {
  const summaries = ruleSummaryIndex([{ digest, description: 'Increase Strength.' }])
  expect(ruleSummaryIn(summaries, '<b>Add 1</b> to Strength.')).toBe('Increase Strength.')
  expect(ruleSummaryIn(summaries, 'Add 2 to Strength.')).toBeUndefined()
})

it('withholds a summary if authored descriptions disagree about the same wording', () => {
  const summaries = ruleSummaryIndex([
    { digest, description: 'Increase Strength.' },
    { digest, description: 'Increase Toughness.' },
    { digest, description: 'Increase Strength.' },
  ])
  expect(ruleSummaryIn(summaries, 'Add 1 to Strength.')).toBeUndefined()
})

it('withholds wording reproduced by the renderer', () => {
  const summaries = ruleSummaryIndex([{ digest, description: 'Add 1 to Strength.' }])
  expect(ruleSummaryIn(summaries, '<b>Add 1</b> to Strength.')).toBeUndefined()
})

it('withholds a summary that repeats a paragraph of another printed rule', () => {
  const line = 'This model is eligible to shoot during a turn in which it has already moved.'
  const summaries = ruleSummaryIndex([{ digest, description: `The effect has two parts.\n${line}` }])
  expect(withoutOriginalWording(summaries, [`<p>${line}</p>\nA different effect.`]).has(digest)).toBe(false)
})
