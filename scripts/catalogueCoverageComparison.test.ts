import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compareCatalogueCoverage } from './catalogueCoverageComparison'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('catalogue coverage comparison', () => {
  it('reports a field removed from the head snapshot', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-coverage-comparison-'))
    temporaryDirectories.push(root)
    const catalogue = path.join(root, 'catalogue')
    const rules = path.join(catalogue, 'rules')
    fs.mkdirSync(path.join(catalogue, 'datacards', '11th', 'gdc'), { recursive: true })
    fs.mkdirSync(path.join(rules, 'data', 'core'), { recursive: true })
    fs.writeFileSync(
      path.join(catalogue, 'datacards', '11th', 'gdc', 'faction.json'),
      JSON.stringify({ name: 'Example Faction', detachments: [] }),
    )
    const base = path.join(root, 'base.json')
    const head = path.join(root, 'head.json')
    const faction = {
      name: 'Example Faction',
      slug: 'example-faction',
      armyRules: ['Example Rule'],
      detachments: [],
      datasheets: [],
    }
    fs.writeFileSync(base, JSON.stringify([faction]))
    fs.writeFileSync(head, JSON.stringify([{ ...faction, armyRules: [] }]))

    const compared = compareCatalogueCoverage(base, head, [], catalogue, rules)

    expect(compared.lost).toEqual(['example-faction army rules: Example Rule'])
  })
})
