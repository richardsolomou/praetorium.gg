import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { expect, it } from 'vitest'

it('is byte-identical across publisher locales', () => {
  const root = path.join(import.meta.dirname, '../..')
  const script = `
    import { bookOf, categories, points } from './src/server/catalogue.fixtures.ts'
    import { compileCanonicalCatalogue } from './src/server/canonicalCatalogue.ts'
    const loaded = bookOf({
      name: 'Test catalogue',
      selectionEntries: [
        {
          id: 'leader',
          name: 'Leader',
          type: 'model',
          costs: points(100),
          categoryLinks: categories('Faction: Test catalogue'),
          infoGroups: [{
            id: 'leader-group',
            name: 'Leader',
            profiles: [{
              id: 'leader-profile',
              name: 'Leader',
              characteristics: [{
                name: 'Description',
                $text: 'This model can be attached to the following units:\\n■ IMPERIAL GUARD',
              }],
            }],
          }],
        },
        {
          id: 'guard',
          name: 'Imperial Guard',
          type: 'unit',
          costs: points(100),
          categoryLinks: categories('Faction: Test catalogue'),
        },
      ],
    })
    process.stdout.write(JSON.stringify(compileCanonicalCatalogue(loaded, { definitions: 'definitions-revision' })))
  `
  const compile = (locale: string) =>
    execFileSync('pnpm', ['tsx', '-e', script], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: locale },
    })

  expect(compile('tr_TR.UTF-8')).toBe(compile('C.UTF-8'))
})
