import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { catalogueLock } from '../src/server/catalogueSnapshot'
import { catalogueSources } from '../src/server/catalogueSources'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-contributor-setup-'))
  fs.mkdirSync(path.join(root, 'scripts'))
  fs.mkdirSync(path.join(root, 'catalogue'))
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}')
  for (const script of ['syncCatalogue.ts', 'materializeCatalogue.ts'])
    fs.copyFileSync(path.join(import.meta.dirname, script), path.join(root, 'scripts', script))
  // A copy rather than a link, so the materializer reads this root's (absent) patches instead of the repository's.
  fs.cpSync(path.join(import.meta.dirname, 'lib'), path.join(root, 'scripts', 'lib'), { recursive: true })
  fs.symlinkSync(path.join(import.meta.dirname, '..', 'src'), path.join(root, 'src'))
  fs.symlinkSync(path.join(import.meta.dirname, '..', 'node_modules'), path.join(root, 'node_modules'))
  fs.writeFileSync(
    path.join(root, 'public-source.zip'),
    zipSync({ 'repository/Faction.json': new TextEncoder().encode('{"catalogue":{"id":"cat","name":"Public faction"}}') }),
  )
  fs.writeFileSync(
    path.join(root, 'public-source.mjs'),
    `import fs from 'node:fs';
globalThis.fetch = async (url) => {
  if (String(url) !== 'https://codeload.github.com/${catalogueSources.definitions.repository}/zip/${catalogueSources.definitions.revision}') throw new Error('unexpected network request');
  return new Response(fs.readFileSync(new URL('./public-source.zip', import.meta.url)));
};`,
  )
  fs.writeFileSync(
    path.join(root, 'catalogue', 'composition.json'),
    JSON.stringify({
      format: 'praetorium.catalogue-composition.v1',
      overlays: [],
      editions: [
        {
          edition: {
            id: 'public',
            name: 'Public rules',
            status: 'released',
            default: true,
            catalogueIds: ['cat'],
            releases: [{ at: 1, status: 'released' }],
          },
          base: true,
          sources: {},
          overlays: [],
        },
        {
          edition: {
            id: 'historical',
            name: 'Historical',
            status: 'retired',
            default: false,
            catalogueIds: ['cat'],
            releases: [{ at: 1, status: 'retired' }],
          },
          snapshot: catalogueLock.pointer,
          sources: {},
          overlays: [],
        },
      ],
    }),
  )
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

function prepare(environment: NodeJS.ProcessEnv = {}) {
  return execFileSync(
    process.execPath,
    ['--import', import.meta.resolve('tsx'), path.join(root, 'scripts', 'syncCatalogue.ts'), '--prepare'],
    {
      cwd: root,
      env: {
        ...process.env,
        R2_ACCOUNT_ID: '',
        R2_ACCESS_KEY_ID: '',
        R2_SECRET_ACCESS_KEY: '',
        CATALOGUE_BASE_URL: '',
        CATALOGUE_CACHE_DIR: path.join(root, 'empty-cache'),
        CATALOGUE_DIR: path.join(root, 'catalogue-data'),
        CATALOGUE_DISABLED_SOURCES: 'points,datacards,battlemaster,icons',
        NODE_OPTIONS: `--import=${path.join(root, 'public-source.mjs')}`,
        ...environment,
      },
    },
  )
}

it('prepares a contributor catalogue without private credentials or a cached snapshot', () => {
  prepare()

  const directory = path.join(root, 'catalogue-data')
  expect({
    versions: JSON.parse(fs.readFileSync(path.join(directory, 'composition.json'), 'utf8')).editions.map(
      (entry: { edition: { id: string } }) => entry.edition.id,
    ),
    faction: JSON.parse(fs.readFileSync(path.join(directory, 'definitions', 'Faction.json'), 'utf8')).catalogue.name,
  }).toEqual({ versions: ['public'], faction: 'Public faction' })
})

it('reports invalid private configuration instead of silently omitting editions', () => {
  expect(() => prepare({ R2_ACCOUNT_ID: 'invalid' })).toThrow('Incomplete R2 object storage configuration')
})
