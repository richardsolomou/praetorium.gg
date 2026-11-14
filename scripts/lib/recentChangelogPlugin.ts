import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { RELEASE_DAYS, recentChangelog } from '../../src/core/releaseNotes.ts'

/**
 * Serves `CHANGELOG.md?raw` cut to the releases What's new lists, so the server neither bundles nor
 * parses the whole history. Builds without this plugin import the full file and list the same releases.
 */
export function recentChangelogPlugin(): Plugin {
  const changelog = path.resolve(import.meta.dirname, '../../CHANGELOG.md')
  return {
    name: 'recent-changelog',
    enforce: 'pre',
    load(id) {
      if (id !== `${changelog}?raw`) return
      return `export default ${JSON.stringify(recentChangelog(fs.readFileSync(changelog, 'utf8'), RELEASE_DAYS))}`
    },
  }
}
