import { expect, it } from 'vitest'
import { summarySegments } from './summarySpans'

it('cuts a summary at its spans in UTF-16 offsets', () => {
  const text = 'Roll a D6 within 3″ of the target.'
  const span = { start: 17, end: 19, bold: true }
  expect(summarySegments(text, [span])).toEqual([
    { text: 'Roll a D6 within ', start: 0 },
    { text: '3″', start: 17, span },
    { text: ' of the target.', start: 19 },
  ])
})

it('leaves out a span that overlaps the one before it', () => {
  const first = { start: 0, end: 4 }
  expect(summarySegments('Roll a D6.', [first, { start: 2, end: 6 }])).toEqual([
    { text: 'Roll', start: 0, span: first },
    { text: ' a D6.', start: 4 },
  ])
})
