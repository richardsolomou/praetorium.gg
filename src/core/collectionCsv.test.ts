import { describe, expect, it } from 'vitest'
import { collectionCsv, importChange, readCollectionCsv, type ImportedRow } from './collectionCsv'
import { parseCsv } from './csv'

const sheets = [
  { id: 'warriors', name: 'Necron Warriors', faction: 'Necrons' },
  { id: 'overlord', name: 'Overlord', faction: 'Necrons' },
  { id: 'rhino-sm', name: 'Rhino', faction: 'Space Marines' },
  { id: 'rhino-csm', name: 'Rhino', faction: 'Chaos Space Marines' },
]

const read = (text: string) => {
  const result = readCollectionCsv(text, sheets)
  if ('error' in result) throw new Error(result.error)
  return result.rows
}
const status = (rows: ImportedRow[]) => rows.map((row) => row.status)

describe('collection CSV', () => {
  it('writes only the header for an empty collection', () => {
    expect(collectionCsv([])).toBe('faction,datasheet,datasheet_id,models,built,painted,wanted,counts_as_ids\r\n')
  })

  it('round-trips several datasheets through their ids', () => {
    const rows = [
      { entryId: 'warriors', name: 'Necron Warriors', faction: 'Necrons', models: 20, built: 10, painted: 5, wanted: 0 },
      { entryId: 'rhino-sm', name: 'Rhino', faction: 'Space Marines', models: 0, built: 0, painted: 0, wanted: 1 },
    ]
    expect(read(collectionCsv(rows))).toEqual([
      { line: 2, name: 'Necron Warriors', status: 'recognised', entryId: 'warriors', models: 20, built: 10, painted: 5, wanted: 0 },
      { line: 3, name: 'Rhino', status: 'recognised', entryId: 'rhino-sm', models: 0, built: 0, painted: 0, wanted: 1 },
    ])
  })

  it('round-trips what the models also count as', () => {
    expect(
      read(
        collectionCsv([
          {
            entryId: 'warriors',
            name: 'Necron Warriors',
            faction: 'Necrons',
            models: 2,
            built: 0,
            painted: 0,
            wanted: 0,
            countsAs: ['overlord'],
          },
        ]),
      )[0],
    ).toMatchObject({ status: 'recognised', countsAs: ['overlord'] })
  })

  it('drops links to datasheets the current rules lack', () => {
    expect(read('datasheet_id,models,counts_as_ids\nwarriors,2,overlord;retired\n')[0]).toMatchObject({ countsAs: ['overlord'] })
  })

  it('drops a link to the datasheet itself', () => {
    expect(read('datasheet_id,models,counts_as_ids\nwarriors,2,warriors\n')[0]).not.toHaveProperty('countsAs')
  })

  it('refuses links on a row without owned models', () => {
    expect(status(read('datasheet_id,wanted,counts_as_ids\nwarriors,2,overlord\n'))).toEqual(['invalid'])
  })

  it('quotes cells holding commas and quotes', () => {
    expect(
      parseCsv(
        collectionCsv([{ entryId: 'a', name: 'Lord, "the" Great', faction: 'X', models: 1, built: 0, painted: 0, wanted: 0 }]),
      )[1]![1],
    ).toBe('Lord, "the" Great')
  })

  it('keeps spreadsheet formulas from running', () => {
    expect(collectionCsv([{ entryId: 'a', name: '=HYPERLINK("x")', faction: 'X', models: 1, built: 0, painted: 0, wanted: 0 }])).toContain(
      `"'=HYPERLINK(""x"")"`,
    )
  })

  it('reads a byte order mark and bare line feeds', () => {
    expect(parseCsv('﻿a,b\nc,d\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('matches a name when the file has no ids', () => {
    expect(status(read('datasheet,models\nnecron   warriors,10\n'))).toEqual(['recognised'])
  })

  it('asks which datasheet a shared name means', () => {
    expect(status(read('datasheet,models\nRhino,1\n'))).toEqual(['ambiguous'])
  })

  it('uses the faction column to settle a shared name', () => {
    expect(read('faction,datasheet,models\nSpace Marines,Rhino,1\n')[0]).toMatchObject({ status: 'recognised', entryId: 'rhino-sm' })
  })

  it('reports a name no current datasheet has', () => {
    expect(status(read('datasheet,models\nSquiggoth,1\n'))).toEqual(['unmatched'])
  })

  it('uses the first of two rows for one datasheet', () => {
    expect(status(read('datasheet_id,models\nwarriors,10\nwarriors,20\n'))).toEqual(['recognised', 'duplicate'])
  })

  it('refuses more painted than built models', () => {
    expect(status(read('datasheet_id,models,built,painted\nwarriors,10,2,3\n'))).toEqual(['invalid'])
  })

  it('refuses more built than owned models', () => {
    expect(status(read('datasheet_id,models,built\nwarriors,1,2\n'))).toEqual(['invalid'])
  })

  it('refuses counts that are not whole numbers', () => {
    expect(status(read('datasheet_id,models\nwarriors,-1\n'))).toEqual(['invalid'])
  })

  it('refuses a row with nothing to import', () => {
    expect(status(read('datasheet_id,models\nwarriors,0\n'))).toEqual(['invalid'])
  })

  it('refuses a file without a datasheet column', () => {
    expect(readCollectionCsv('name,models\nwarriors,1\n', sheets)).toEqual({ error: expect.stringContaining('datasheet') })
  })

  it('refuses an oversized file before reading it', () => {
    expect(readCollectionCsv(`datasheet,models\n${'x'.repeat(1_000_001)}`, sheets)).toEqual({ error: expect.stringContaining('larger') })
  })
})

describe('import change', () => {
  const counts = { models: 10, built: 5, painted: 2, wanted: 0 }

  it('adds a datasheet the collection lacks', () => {
    expect(importChange(counts, undefined)).toBe('new')
  })

  it('leaves identical counts alone', () => {
    expect(importChange(counts, counts)).toBe('same')
  })

  it('flags different owned counts as a conflict', () => {
    expect(importChange({ ...counts, painted: 3 }, counts)).toBe('conflict')
  })

  it('adds a wish beside an owned datasheet', () => {
    expect(importChange({ models: 0, built: 0, painted: 0, wanted: 4 }, counts)).toBe('new')
  })

  it('flags a different wish as a conflict', () => {
    expect(importChange({ models: 0, built: 0, painted: 0, wanted: 4 }, { ...counts, wanted: 2 })).toBe('conflict')
  })

  it('adds links to a datasheet without any', () => {
    expect(importChange({ ...counts, countsAs: ['overlord'] }, counts)).toBe('new')
  })

  it('flags different links as a conflict', () => {
    expect(importChange({ ...counts, countsAs: ['overlord'] }, { ...counts, countsAs: ['lord'] })).toBe('conflict')
  })

  it('treats no links as leaving saved links alone', () => {
    expect(importChange(counts, { ...counts, countsAs: ['lord'] })).toBe('same')
  })

  it('treats a zero count as leaving the saved count alone', () => {
    expect(importChange({ models: 0, built: 0, painted: 0, wanted: 2 }, { ...counts, wanted: 2 })).toBe('same')
  })
})
