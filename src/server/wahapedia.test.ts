import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { descriptionKey, loadWahapediaDescriptions } from './wahapedia'

let directory: string

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-wahapedia-'))
})

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))

it('reads multiline HTML descriptions as plain text', () => {
  write('Stratagems.csv', 'name|detachment|description|\nCalculated Targeting|Cryptek Conclave|<b>WHEN:</b><br>After moving.|\n')
  write('Enhancements.csv', 'name|detachment|description|\n')
  expect(loadWahapediaDescriptions(directory)?.stratagems.get(descriptionKey('Cryptek Conclave', 'Calculated Targeting'))).toBe(
    'WHEN:\nAfter moving.',
  )
})

it('drops conflicting descriptions for the same rule', () => {
  write(
    'Stratagems.csv',
    'name|detachment|description|\nCalculated Targeting|Cryptek Conclave|First|\nCalculated Targeting|Cryptek Conclave|Second|\n',
  )
  write('Enhancements.csv', 'name|detachment|description|\n')
  expect(loadWahapediaDescriptions(directory)?.stratagems.has(descriptionKey('Cryptek Conclave', 'Calculated Targeting')) ?? false).toBe(
    false,
  )
})

const write = (name: string, contents: string) => fs.writeFileSync(path.join(directory, name), contents)
