import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'

const compilerSources = [
  'pnpm-lock.yaml',
  'tsconfig.json',
  'catalogue',
  'scripts/catalogueRefresh.ts',
  'scripts/compileCatalogueRuntime.ts',
]

function* sourceFiles(root: string, relative: string): Generator<string> {
  const target = path.join(root, relative)
  if (!fs.existsSync(target)) return
  if (fs.statSync(target).isFile()) {
    if (!/\.(?:integration\.)?test\.[^.]+$/.test(relative)) yield relative
    return
  }
  for (const entry of fs.readdirSync(target).sort()) yield* sourceFiles(root, path.join(relative, entry))
}

function* imports(node: unknown): Generator<string> {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) yield* imports(child)
    return
  }
  const syntax = node as { type?: string; source?: { type: string; value?: string } }
  if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(syntax.type ?? '')) {
    if (syntax.type === 'ImportExpression' && syntax.source?.type !== 'StringLiteral') {
      throw new Error('Cannot fingerprint a computed dynamic import in catalogue compiler sources')
    }
    if (syntax.source?.value) yield syntax.source.value
  }
  for (const child of Object.values(node)) yield* imports(child)
}

function resolveImport(root: string, importer: string, specifier: string) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null
  const target = specifier.startsWith('@/')
    ? path.join(root, 'src', specifier.slice(2))
    : path.resolve(root, path.dirname(importer), specifier)
  const candidates = [
    target,
    ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '/index.ts', '/index.tsx'].map((ext) => target + ext),
  ]
  const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
  if (!resolved) throw new Error(`Cannot resolve catalogue compiler import ${specifier} from ${importer}`)
  return path.relative(root, resolved)
}

/** Hash compiler inputs from disk because application images omit Git metadata. */
export function compilerSourcesFingerprint(worktree = process.cwd(), inputs = compilerSources) {
  const files = new Set(inputs.flatMap((source) => [...sourceFiles(worktree, source)]))
  for (const file of files) {
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue
    const syntax = parse(fs.readFileSync(path.join(worktree, file), 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      createImportExpressions: true,
    })
    for (const specifier of imports(syntax.program)) {
      const dependency = resolveImport(worktree, file, specifier)
      if (dependency) files.add(dependency)
    }
  }
  const hash = createHash('sha256')
  for (const file of [...files].sort()) {
    hash
      .update(file)
      .update('\0')
      .update(fs.readFileSync(path.join(worktree, file)))
      .update('\0')
  }
  return hash.digest('hex')
}
