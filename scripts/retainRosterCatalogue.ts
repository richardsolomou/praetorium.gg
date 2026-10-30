import { execFileSync } from 'node:child_process'
import { hash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import recipe from '../catalogue/retained-profile-build.json' with { type: 'json' }
import { packCatalogueSnapshot, verifyInstalledSnapshot } from '../src/server/catalogueSnapshot'

function retainRosterCatalogue(source: string, icons: string, output: string) {
  const sourcePointer = verifyInstalledSnapshot(source)
  const selected = recipe.snapshots.find(({ pointer: expected }) => JSON.stringify(sourcePointer) === JSON.stringify(expected))
  if (!selected) throw new Error('Historical source does not match the retained build recipe')
  if (JSON.stringify(verifyInstalledSnapshot(icons)) !== JSON.stringify(recipe.iconSnapshot))
    throw new Error('Icons snapshot does not match the retained build recipe')
  if (fs.lstatSync(output, { throwIfNoEntry: false })) throw new Error('Retained output already exists')
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-retained-'))
  const repository = path.resolve(import.meta.dirname, '..')
  try {
    execFileSync('git', ['archive', `--output=${path.join(work, 'compiler.tar')}`, recipe.compiler, 'src'], { cwd: repository })
    execFileSync('tar', ['-xf', 'compiler.tar'], { cwd: work })
    fs.symlinkSync(path.join(repository, 'node_modules'), path.join(work, 'node_modules'))
    fs.writeFileSync(
      path.join(work, 'prepare.ts'),
      `import fs from 'node:fs'; import path from 'node:path';
import { prepareCatalogueProfileRules } from './src/server/catalogueProfileRules';
const [source, output] = process.argv.slice(2);
const raw = fs.readdirSync(source).filter(file => file.endsWith('.json')).map(file => JSON.parse(fs.readFileSync(path.join(source, file), 'utf8')));
const { files, profiledCatalogueIds } = prepareCatalogueProfileRules(raw);
fs.mkdirSync(output, {recursive:true});
for (const file of files) fs.writeFileSync(path.join(output, (file.catalogue ?? file.gameSystem).id + '.json'), JSON.stringify(file));
fs.writeFileSync(path.join(output, '..', 'reference-policy.json'), JSON.stringify({datacardExcludedCatalogueIds:[...profiledCatalogueIds].sort()}));
`,
    )
    const staged = path.join(work, 'data')
    execFileSync(
      process.execPath,
      ['--import', 'tsx', path.join(work, 'prepare.ts'), path.resolve(source, 'definitions'), path.join(staged, 'definitions')],
      { cwd: repository },
    )
    for (const name of ['points', 'datacards', 'battlemaster'])
      fs.cpSync(path.join(source, name), path.join(staged, name), { recursive: true, dereference: true })
    fs.cpSync(path.join(icons, 'icons'), path.join(staged, 'icons'), { recursive: true, dereference: true })
    const revisions = JSON.parse(fs.readFileSync(path.join(source, 'revision.json'), 'utf8')) as Record<string, string>
    fs.writeFileSync(
      path.join(staged, 'revision.json'),
      JSON.stringify({
        ...revisions,
        definitions: hash('sha256', JSON.stringify({ source: revisions.definitions, compiler: recipe.compiler })),
        icons: recipe.icons.revision,
      }),
    )
    fs.writeFileSync(
      path.join(staged, 'composition.json'),
      JSON.stringify({
        format: 'praetorium.catalogue-composition.v1',
        overlays: [],
        editions: [],
        baseSources: { ...recipe.baseSources, ...selected.sources },
      }),
    )
    fs.writeFileSync(
      path.join(staged, 'retained-build.json'),
      JSON.stringify({
        snapshot: selected.pointer,
        compiler: recipe.compiler,
        transform: recipe.transform,
        icons: recipe.icons,
      }),
    )
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
    const pointer = packCatalogueSnapshot(staged, `${output}.zip`, `${output}.pointer.json`)
    fs.cpSync(staged, output, { recursive: true, dereference: true })
    return pointer
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

const [source, icons, output] = process.argv.slice(2)
if (!source || !icons || !output || process.argv.length !== 5)
  throw new Error('Usage: retainRosterCatalogue.ts <verified-historical-directory> <verified-icons-directory> <new-output-directory>')
console.log(retainRosterCatalogue(source, icons, output))
