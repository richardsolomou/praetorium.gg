import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = path.join(root, 'src')
const areas = [
  { from: path.join(source, 'core'), to: path.join(source, 'contracts'), message: 'Core must own its domain types.' },
  {
    from: path.join(source, 'client', 'components'),
    to: path.join(source, 'client', 'features'),
    message: 'Shared components must not depend on a product feature.',
  },
]

function* sourceFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) yield* sourceFiles(file)
    else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\.tsx?$/.test(entry.name)) yield file
  }
}

function resolvedImport(file: string, specifier: string) {
  if (specifier.startsWith('@/')) return path.join(source, specifier.slice(2))
  if (specifier.startsWith('.')) return path.resolve(path.dirname(file), specifier)
  return null
}

let violations = 0
for (const area of areas) {
  for (const file of sourceFiles(area.from)) {
    for (const [index, line] of readFileSync(file, 'utf8').split('\n').entries()) {
      const specifier = line.match(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/)?.[1]
      if (!specifier) continue
      const target = resolvedImport(file, specifier)
      if (!target) continue
      const relative = path.relative(area.to, target)
      if (relative.startsWith('..') || path.isAbsolute(relative)) continue
      console.error(`${path.relative(root, file)}:${index + 1}: ${area.message} (${specifier})`)
      violations++
    }
  }
}
if (violations) process.exitCode = 1
