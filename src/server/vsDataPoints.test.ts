import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { CatalogueIndex } from '../core/catalogue'
import { vsPointsIn } from './vsDataPoints'

let root: string
const index = { definitions: new Map() } as unknown as CatalogueIndex
const construction = (release: string) => ({
  release,
  rulesVersion: { edition: '11th', update: release },
  unavailable: [],
  definitions: {},
  points: [],
})

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-data-points-'))
  fs.copyFileSync(path.resolve('catalogue/composition.json'), path.join(root, 'composition.json'))
  fs.mkdirSync(path.join(root, 'summaries'))
  for (const id of ['mfm-1-6', 'marine-main', 'legacy-rosters']) {
    fs.writeFileSync(path.join(root, 'summaries', `${id}.construction.json`), JSON.stringify(construction(id)))
    fs.mkdirSync(path.join(root, 'editions', id), { recursive: true })
  }
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

it('prices an earlier rules version from its own release', () => {
  expect(vsPointsIn(path.join(root, 'editions', 'marine-main'), index, 'marine-main')).not.toBeNull()
})
