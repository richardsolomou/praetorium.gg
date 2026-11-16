import { parseChangesetFile } from '@changesets/parse'
import { readdirSync, readFileSync } from 'node:fs'

// Changesets only fails on a bad file at release time, after the pull request that added it has merged.
const packageNames = new Set(
  ['.', 'mobile', 'spacetimedb'].map((dir) => (JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')) as { name: string }).name),
)
const errors: string[] = []
for (const file of readdirSync('.changeset').filter((name) => name.endsWith('.md') && name !== 'README.md')) {
  const path = `.changeset/${file}`
  try {
    for (const { name } of parseChangesetFile(readFileSync(path, 'utf8')).releases)
      if (!packageNames.has(name)) errors.push(`${path}: unknown package ${JSON.stringify(name)}`)
  } catch {
    errors.push(`${path}: missing or invalid frontmatter`)
  }
}
for (const error of errors) console.error(error)
if (errors.length) process.exitCode = 1
