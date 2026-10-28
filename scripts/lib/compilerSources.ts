import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { build, type Rolldown } from 'vite'

export const compilerEntries = ['scripts/catalogueRefresh.ts', 'scripts/compileCatalogueRuntime.ts']
// The compiler reads catalogue configuration from disk; the seed build config bundles the production worker.
const compilerFiles = ['catalogue', 'vite.seed.config.ts']

function* sourceFiles(root: string, relative: string): Generator<string> {
  const target = path.join(root, relative)
  if (!fs.existsSync(target)) return
  if (fs.statSync(target).isFile()) {
    if (!/\.(?:integration\.)?test\.[^.]+$/.test(relative)) yield relative
    return
  }
  for (const entry of fs.readdirSync(target).sort()) yield* sourceFiles(root, path.join(relative, entry))
}

/** Hashes every file under `inputs`, byte for byte. */
export function treeFingerprint(root: string, inputs: readonly string[]) {
  const hash = createHash('sha256')
  for (const file of new Set(inputs.flatMap((input) => [...sourceFiles(root, input)])))
    hash
      .update(file)
      .update('\0')
      .update(fs.readFileSync(path.join(root, file)))
      .update('\0')
  return hash.digest('hex')
}

/** Identifies the catalogue configuration a compiler materializes with: sources, composition and patches. */
export const catalogueAuthoring = (root = process.cwd()) => treeFingerprint(root, ['catalogue'])

/** The compiler's entry points bundled with every dependency they reach. */
async function compilerBundle(root: string, entries: readonly string[]) {
  const result = (await build({
    configFile: false,
    envDir: false,
    logLevel: 'silent',
    mode: 'production',
    root,
    ssr: { noExternal: true },
    build: {
      ssr: true,
      write: false,
      minify: false,
      reportCompressedSize: false,
      rolldownOptions: {
        input: entries.map((entry) => path.join(root, entry)),
        output: { entryFileNames: '[name].mjs', chunkFileNames: '[name].mjs', comments: false },
      },
    },
  })) as Rolldown.RolldownOutput | Rolldown.RolldownOutput[]
  return [result].flat().flatMap(({ output }) => output)
}

/**
 * Identifies the catalogue compiler by its bundle, so only a change to code the compiler runs
 * invalidates prepared catalogues. Comments, formatting, unused exports and unrelated modules or
 * packages never reach the bundle.
 */
export async function compilerFingerprint(root = process.cwd(), entries = compilerEntries) {
  const hash = createHash('sha256')
  const outputs = await compilerBundle(root, entries)
  for (const output of outputs.toSorted((left, right) => left.fileName.localeCompare(right.fileName)))
    hash
      .update(output.fileName)
      .update('\0')
      // Region markers name each module's path, which depends on where dependencies are installed.
      .update(output.type === 'chunk' ? output.code.replace(/^\/\/#(?:end)?region\b.*$/gm, '') : output.source)
      .update('\0')
  return hash.update(treeFingerprint(root, compilerFiles)).digest('hex')
}
