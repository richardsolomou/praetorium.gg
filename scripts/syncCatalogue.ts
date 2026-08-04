/**
 * Fetches the community data at the revisions `catalogue/sources.json` pins, into a
 * working directory that is never committed.
 *
 *   --check    offline: validate sources.json only (runs in `pnpm check`)
 *   --update   move each source to the head of its branch and rewrite sources.json
 *
 * The fetching itself is `src/server/sync.ts`, the same code the server runs, so
 * development and production cannot drift.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { SOURCE_NAMES, syncSources } from '../src/server/sync'

const sourceSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'expected owner/name'),
  branch: z.string().min(1),
  revision: z.string().regex(/^[0-9a-f]{40}$/, 'expected a full commit sha, so the data cannot move underneath us'),
  path: z.string().optional(),
  attribution: z.string().optional(),
  description: z.string().optional(),
})

const sourcesSchema = z.object({ definitions: sourceSchema, points: sourceSchema, rules: sourceSchema })

const sourcesFile = path.join(import.meta.dirname, '..', 'catalogue', 'sources.json')
const dataDirectory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')

const readSources = () => sourcesSchema.parse(JSON.parse(fs.readFileSync(sourcesFile, 'utf8')))

/** The head of a branch, through the `gh` CLI so the caller's existing auth is used. */
const head = (repository: string, branch: string) =>
  execFileSync('gh', ['api', `repos/${repository}/commits/${branch}`, '--jq', '.sha'], { encoding: 'utf8' }).trim()

const argument = process.argv[2]

if (argument === '--check') {
  readSources()
  console.log('catalogue sources are pinned and well formed')
} else if (argument === '--update') {
  const sources = readSources()
  for (const name of SOURCE_NAMES) {
    const source = sources[name]
    const latest = head(source.repository, source.branch)
    if (latest === source.revision) {
      console.log(`${name}: already at ${latest.slice(0, 10)}`)
      continue
    }
    console.log(`${name}: ${source.revision.slice(0, 10)} -> ${latest.slice(0, 10)}`)
    sources[name] = { ...source, revision: latest }
  }
  fs.writeFileSync(sourcesFile, `${JSON.stringify(sources, null, 2)}\n`)
} else {
  await syncSources(dataDirectory, (message) => console.log(message))
}
