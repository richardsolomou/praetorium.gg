import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'
import { sealedEventResultsCsv } from './sealedEventResultsCsv'

const file = (partial: boolean, player = 'Ada') =>
  sealedEventResultsCsv({
    event: 'Autumn Open',
    capturedAt: new Date('2026-10-26T12:00:00Z'),
    partial,
    columns: ['Played', 'Won'],
    rows: [{ place: 1, player, figures: [3, 2] }],
  })

describe('sealedEvent results CSV', () => {
  it.each(['=', '+', '-', '@', '\t'])('keeps a name starting with %j from running as a formula', (prefix) => {
    expect(parseCsv(file(false, `${prefix}HYPERLINK("x")`)).at(-1)?.[1]).toBe(`'${prefix}HYPERLINK("x")`)
  })

  it('says when only the latest battles are counted', () => {
    expect(parseCsv(file(true))).toContainEqual(['Completeness', 'Only the latest 500 battles are included.'])
  })
})
