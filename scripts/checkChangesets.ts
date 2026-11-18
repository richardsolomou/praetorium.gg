import { parseChangesetFile } from '@changesets/parse'
import { readdirSync, readFileSync } from 'node:fs'
import { RELEASE_AREAS, releaseChange } from '../src/core/releaseNotes.ts'

// Changesets only fails on a bad file at release time, after the pull request that added it has merged.
const [appName, ...otherNames] = ['.', 'mobile', 'spacetimedb'].map(
  (dir) => (JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')) as { name: string }).name,
)
const packageNames = new Set([appName, ...otherNames])
const areaTags = Object.keys(RELEASE_AREAS)
  .map((area) => `[${area}]`)
  .join(', ')
const errors: string[] = []
for (const file of readdirSync('.changeset').filter((name) => name.endsWith('.md') && name !== 'README.md')) {
  const path = `.changeset/${file}`
  try {
    const { releases, summary } = parseChangesetFile(readFileSync(path, 'utf8'))
    for (const { name } of releases) if (!packageNames.has(name)) errors.push(`${path}: unknown package ${JSON.stringify(name)}`)
    // What's new groups the app's changes by this tag.
    if (releases.some(({ name }) => name === appName) && !releaseChange(summary).area)
      errors.push(`${path}: start the summary with one of ${areaTags}`)
    // Changesets keeps every paragraph in one changelog entry, which What's new shows as one change.
    if (/\n\s*\n/.test(summary)) errors.push(`${path}: keep the summary to one paragraph and give each other change its own changeset`)
  } catch {
    errors.push(`${path}: missing or invalid frontmatter`)
  }
}
for (const error of errors) console.error(error)
if (errors.length) process.exitCode = 1
