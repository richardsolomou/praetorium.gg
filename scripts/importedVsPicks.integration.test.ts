import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { importVsMaps } from '../src/server/importVsMaps'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { importRosterFile } from '../src/shared/rosterFiles'
import type { LoadedRules } from '../src/shared/rules'
import { sharedSnapshot } from './lib/catalogueSnapshotLoad'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const squad = 'space-marines.terminator-squad'
const file = `Test (380 Points)

Space Marines
Gladius Task Force
Strike Force (2,000 Points)

OTHER DATASHEETS

Terminator Squad (380 Points)
  • 1x Terminator Sergeant
     ◦ 1x Power fist
     ◦ 1x Storm bolter
  • 9x Terminator
     ◦ 1x Heavy flamer
     ◦ 9x Power fist
     ◦ 8x Storm bolter
`

describe.skipIf(!fs.existsSync(path.join(directory, 'definitions')))('an imported unit the builder adds by VS Data', () => {
  let loaded: LoadedCatalogue
  let rules: LoadedRules | null
  const imported = (maps?: ReturnType<typeof importVsMaps>) =>
    importRosterFile({ file }, loaded, undefined, rules, undefined, undefined, maps)

  beforeAll(() => {
    ;({ catalogue: loaded, rules } = sharedSnapshot(directory))
  })

  it('comes in as a VS pick holding the selections its choices stand for', () => {
    expect(imported(importVsMaps()).units[0]!.vs?.options).toEqual({ [`${squad}.terminator-loadout`]: { [`${squad}.heavy-flamer`]: 1 } })
  })

  it('costs what the catalogue pick costs', () => {
    expect(imported(importVsMaps()).currentPoints).toBe(imported().currentPoints)
  })

  it('stays a catalogue pick where the frozen maps are not held, as on a device', () => {
    expect(imported().units[0]!.vs).toBeUndefined()
  })
})
