import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import composition from '../../catalogue/composition.json' with { type: 'json' }
import { loadRuleSummaries } from './ruleSummaries'

const id = 'necrons.pantheon-of-woe.phase-melding'
const card = 'ef2e051f-6a3c-573a-8646-4cba770e8bef'
const directories: string[] = []

function release(update: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-summaries-'))
  directories.push(directory)
  const base = composition.editions.filter((entry) => 'base' in entry && entry.base)
  fs.writeFileSync(path.join(directory, 'composition.json'), JSON.stringify({ ...composition, editions: base }))
  const folder = path.join(directory, 'summaries')
  fs.mkdirSync(path.join(folder, 'records'), { recursive: true })
  fs.mkdirSync(path.join(folder, 'summaries'))
  const entry = { id, record: { path: `records/${id}.json` }, summary: { path: `summaries/${id}.txt` } }
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({ records: [entry] }))
  fs.writeFileSync(path.join(folder, entry.record.path), JSON.stringify({ id, rulesVersion: { edition: '11th', update } }))
  fs.writeFileSync(path.join(folder, entry.summary.path), 'A pilot summary.\n')
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('pinned rules summaries', () => {
  it('match a mapped card in the base rules version', () => {
    expect(loadRuleSummaries(release('Necrons Faction Pack v1.3'))('b654-a18a-ea1-3bf2').get(card)).toBe('A pilot summary.')
  })

  it('match a mapped card when the rules version is named', () => {
    expect(loadRuleSummaries(release('Necrons Faction Pack v1.3'))('mfm-1-6~b654-a18a-ea1-3bf2').get(card)).toBe('A pilot summary.')
  })

  it('stay off another rules version', () => {
    expect(loadRuleSummaries(release('Necrons Faction Pack v1.3'))('marine-main~b654-a18a-ea1-3bf2').size).toBe(0)
  })

  it('stay off a record written for another update', () => {
    expect(loadRuleSummaries(release('Necrons Faction Pack v1.4'))('b654-a18a-ea1-3bf2').size).toBe(0)
  })
})
