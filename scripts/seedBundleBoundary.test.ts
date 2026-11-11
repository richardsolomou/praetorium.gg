import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'

// The entries vite.seed.config.ts bundles, which production runs outside the web server.
const ENTRIES = ['scripts/seedPreview.ts', 'src/server/combatCalculation.worker.ts', 'scripts/catalogueRefresh.ts']
// app.ts reaches the photo pipeline's native modules, which the production image does not carry for these bundles.
const APP = 'src/server/app.ts'

const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^;]*?\sfrom\s+)?['"](\.{1,2}\/[^'"?]+)/g
const DYNAMIC = /import\(\s*['"](\.{1,2}\/[^'"?]+)/g

function resolve(from: string, specifier: string) {
  const base = path.join(path.dirname(from), specifier)
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(
    (candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate),
  )
}

/** The chain of runtime imports from `entry` to `target`, or null when none reaches it. */
function importChain(entry: string, target: string) {
  const parent = new Map<string, string | null>([[entry, null]])
  const queue = [entry]
  while (queue.length) {
    const file = queue.shift()!
    if (file === target) {
      const chain = []
      for (let at: string | null = file; at; at = parent.get(at) ?? null) chain.unshift(at)
      return chain
    }
    const source = readFileSync(file, 'utf8')
    for (const match of [...source.matchAll(IMPORT), ...source.matchAll(DYNAMIC)]) {
      const next = resolve(file, match[1]!)
      if (next && !parent.has(next)) {
        parent.set(next, file)
        queue.push(next)
      }
    }
  }
  return null
}

it.each(ENTRIES)('keeps %s from importing the web server app', (entry) => {
  expect(importChain(entry, APP)).toBeNull()
})
