import fs from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { readsAsRulesSentence } from './rulesSentence'

const folder = path.join(import.meta.dirname, '../../catalogue/legacy-ids')

it('keeps rules sentences out of the frozen names', () => {
  const sentences = fs
    .readdirSync(folder)
    .filter((file) => file.endsWith('-names.json'))
    .flatMap((file) =>
      Object.entries(JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')).names as Record<string, string[]>).flatMap(
        ([id, names]) => (names.some(readsAsRulesSentence) ? [`${file} ${id}`] : []),
      ),
    )
  expect(sentences).toEqual([])
})
