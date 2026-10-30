import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire, isBuiltin } from 'node:module'
import path from 'node:path'
import { parse, parseAllDocuments } from 'yaml'
import { isEntryPoint } from './lib/entryPoint.ts'
import { isAncestor } from './lib/git.ts'
import { stepOutput } from './lib/stepOutput.ts'

// The shell pins TypeScript 6; the web compiler no longer exposes this parser API.
const typescript = createRequire(new URL('../mobile/package.json', import.meta.url))(
  'typescript',
) as typeof import('../mobile/node_modules/typescript')
type Dependencies = Record<string, string>
type Importer = {
  dependencies?: Record<string, { version: string }>
  devDependencies?: Record<string, { version: string }>
  optionalDependencies?: Record<string, { version: string }>
}
type Lockfile = {
  lockfileVersion: string | number
  settings: unknown
  importers: Record<string, Importer>
  packages: Record<string, unknown>
  snapshots: Record<string, { dependencies?: Dependencies; optionalDependencies?: Dependencies }>
}

export function mobileInput(file: string) {
  if (/\.(?:md|(?:test|spec)\.[^.]+)$/.test(file) || file.includes('/Tests/')) return false
  return (
    file.startsWith('mobile/') ||
    file.startsWith('fastlane/') ||
    ['Gemfile', 'Gemfile.lock', '.github/workflows/mobile.yml', 'scripts/provisionWatchIos.js', 'pnpm-workspace.yaml'].includes(file)
  )
}

export function iosDeliveryFingerprint(root: string, revision: string, env: NodeJS.ProcessEnv = process.env) {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8_000_000, stdio: ['ignore', 'pipe', 'pipe'] })
  const commit = git('rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`).trim()
  const files = new Map(
    git('ls-tree', '-r', '-z', commit)
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const [metadata, file] = entry.split('\t')
        return [file!, metadata!.split(' ')[2]!]
      }),
  )
  const read = (file: string) => git('show', `${commit}:${file}`)
  const inputs = new Set([...files.keys()].filter(mobileInput))
  const importedPackages = new Map<string, Set<string>>()
  for (const file of inputs) {
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue
    const emitted = typescript.transpileModule(read(file), {
      fileName: file,
      compilerOptions: {
        verbatimModuleSyntax: true,
        module: typescript.ModuleKind.ESNext,
        target: typescript.ScriptTarget.ESNext,
        jsx: typescript.JsxEmit.Preserve,
      },
    }).outputText
    for (const { fileName: name } of typescript.preProcessFile(emitted, true, true).importedFiles) {
      if (name.startsWith('.') || name.startsWith('@/')) {
        const target = name.startsWith('@/') ? `src/${name.slice(2)}` : path.posix.join(path.posix.dirname(file), name)
        const source = [
          target,
          ...['.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx', '/index.js'].map((suffix) => target + suffix),
        ].find((candidate) => files.has(candidate))
        if (!source) throw new Error(`Unresolved native import ${name} in ${file}`)
        inputs.add(source)
      } else if (!isBuiltin(name)) {
        const owner = file.startsWith('mobile/') ? 'mobile' : '.'
        const packages = importedPackages.get(owner) ?? new Set<string>()
        packages.add(
          name
            .split('/')
            .slice(0, name.startsWith('@') ? 2 : 1)
            .join('/'),
        )
        importedPackages.set(owner, packages)
      }
    }
  }

  const document = parseAllDocuments(read('pnpm-lock.yaml')).at(-1)
  if (!document) throw new Error('Missing application lockfile')
  if (document.errors.length) throw document.errors[0]
  const lock = document.toJS() as Lockfile
  if (String(lock.lockfileVersion) !== '9.0') throw new Error(`Unsupported native lockfile version ${lock.lockfileVersion}`)
  const selected = new Map<string, unknown>()
  const visit = (name: string, version: string) => {
    const key = `${name}@${version}`
    if (selected.has(key)) return
    const snapshot = lock.snapshots[key]
    const metadata = lock.packages[key.split('(')[0]!]
    if (!snapshot || !metadata) throw new Error(`Missing native dependency ${key}`)
    selected.set(key, [metadata, snapshot])
    for (const [dependency, resolved] of Object.entries({ ...snapshot.dependencies, ...snapshot.optionalDependencies }))
      visit(dependency, resolved)
  }
  const mobile = lock.importers.mobile
  if (!mobile) throw new Error('Missing mobile lockfile importer')
  selected.set('mobile', mobile)
  for (const dependency of Object.entries({ ...mobile.dependencies, ...mobile.devDependencies, ...mobile.optionalDependencies }))
    visit(dependency[0], dependency[1].version)
  for (const [owner, packages] of importedPackages) {
    const importer = lock.importers[owner]
    for (const name of packages) {
      const dependency = importer?.dependencies?.[name] ?? importer?.devDependencies?.[name] ?? importer?.optionalDependencies?.[name]
      if (!dependency) throw new Error(`Missing native import ${name} in ${owner} lockfile importer`)
      visit(name, dependency.version)
    }
  }
  const manifest = JSON.parse(read('package.json')) as { packageManager?: string; engines?: Record<string, string> }
  const hash = createHash('sha256').update(JSON.stringify([manifest.packageManager, manifest.engines, lock.settings]))
  const publicEnvironment = Object.keys(env)
    .filter((key) => key.startsWith('EXPO_PUBLIC_') && env[key] !== undefined)
    .sort()
    .map((key) => [key, env[key]])
  hash.update(JSON.stringify(publicEnvironment))
  const workspace = parse(read('pnpm-workspace.yaml')) as Record<string, unknown>
  delete workspace.minimumReleaseAge
  delete workspace.minimumReleaseAgeExclude
  inputs.delete('pnpm-workspace.yaml')
  hash.update(JSON.stringify(workspace))
  for (const file of [...inputs].sort()) hash.update(file).update('\0').update(files.get(file)!).update('\0')
  hash.update(JSON.stringify([...selected.entries()].sort(([left], [right]) => left.localeCompare(right))))
  return hash.digest('hex')
}

export function iosDeliveryChanged(root: string, base: string, revision: string, pending: string[] = []) {
  const current = iosDeliveryFingerprint(root, revision)
  return ![base, ...pending].some((previous) => {
    if (/^0+$/.test(previous)) return false
    return isAncestor(root, revision, previous) || iosDeliveryFingerprint(root, previous) === current
  })
}

if (isEntryPoint(import.meta.url)) {
  const [base, revision = 'HEAD'] = process.argv.slice(2)
  if (!base) throw new Error('Usage: iosDelivery.ts <base-revision> [revision]')
  const pending = JSON.parse(process.env.PENDING_IOS_REVISIONS ?? '[]') as string[]
  stepOutput({ changed: iosDeliveryChanged(process.cwd(), base, revision, pending) })
}
