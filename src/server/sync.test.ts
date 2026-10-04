import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { extractSourceArchive, syncFactionIcons } from './sync'
import { SUPPLEMENTAL_FACTION_ICONS } from './factionIconSources'

let directory: string
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-sync-'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(directory, { recursive: true, force: true })
})

it('adds supplemental icons to a materialized source directory', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<svg xmlns="http://www.w3.org/2000/svg"/>')),
  )

  await syncFactionIcons(directory)

  expect(fs.readdirSync(path.join(directory, 'faction-icons')).toSorted()).toEqual(
    SUPPLEMENTAL_FACTION_ICONS.map((icon) => `${icon.id}.svg`).toSorted(),
  )
})

it('extracts the configured Game Datacards path without other editions', () => {
  const archive = zipSync({
    'repository/11th/gdc/core.json': new TextEncoder().encode('{}'),
    'repository/10th/gdc/core.json': new TextEncoder().encode('{}'),
  })
  extractSourceArchive(archive, 'repository', directory, '11th/gdc')

  expect(fs.existsSync(path.join(directory, '10th'))).toBe(false)
  expect(fs.existsSync(path.join(directory, '11th', 'gdc', 'core.json'))).toBe(true)
})

it('keeps the current source when an archive lacks its configured subpath', () => {
  fs.writeFileSync(path.join(directory, 'current.json'), '{}')
  const archive = zipSync({ 'repository/tools/package.json': new TextEncoder().encode('{}') })

  expect(() => extractSourceArchive(archive, 'repository', directory, '11th/gdc')).toThrow('archive contains no files under 11th/gdc')
  expect(fs.existsSync(path.join(directory, 'current.json'))).toBe(true)
})
