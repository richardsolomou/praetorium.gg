/**
 * Fetches the community catalogues at the revisions `catalogue/sources.json`
 * pins, into a working directory that is never committed.
 *
 *   --check    offline: validate sources.json only (runs in `pnpm check`)
 *   --update   move each source to the head of its branch and rewrite sources.json
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const sourceSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'expected owner/name'),
  branch: z.string().min(1),
  revision: z.string().regex(/^[0-9a-f]{40}$/, 'expected a full commit sha, so the data cannot move underneath us'),
  path: z.string().optional(),
  attribution: z.string().optional(),
  description: z.string().optional(),
})

const sourcesSchema = z.object({ definitions: sourceSchema, points: sourceSchema, rules: sourceSchema })

type Sources = z.infer<typeof sourcesSchema>

const sourcesFile = path.join(import.meta.dirname, '..', 'catalogue', 'sources.json')
const dataDirectory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')

function readSources(): Sources {
  return sourcesSchema.parse(JSON.parse(fs.readFileSync(sourcesFile, 'utf8')))
}

/** The head of a branch, through the `gh` CLI so the caller's existing auth is used. */
function head(repository: string, branch: string) {
  return execFileSync('gh', ['api', `repos/${repository}/commits/${branch}`, '--jq', '.sha'], { encoding: 'utf8' }).trim()
}

function fetchInto(source: z.infer<typeof sourceSchema>, directory: string) {
  fs.rmSync(directory, { recursive: true, force: true })
  fs.mkdirSync(directory, { recursive: true })
  const url = `https://codeload.github.com/${source.repository}/tar.gz/${source.revision}`
  // One request for the whole tree, and `tar` is present everywhere this runs.
  execFileSync('sh', ['-c', `curl -fsSL ${JSON.stringify(url)} | tar xz --strip-components=1 -C ${JSON.stringify(directory)}`], {
    stdio: 'inherit',
  })
}

const argument = process.argv[2]

if (argument === '--check') {
  readSources()
  console.log('catalogue sources are pinned and well formed')
} else if (argument === '--update') {
  const sources = readSources()
  for (const name of ['definitions', 'points', 'rules'] satisfies (keyof Sources)[]) {
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
  const sources = readSources()
  for (const [name, source] of Object.entries(sources)) {
    const directory = path.join(dataDirectory, name)
    console.log(`${name}: fetching ${source.repository} at ${source.revision.slice(0, 10)}`)
    fetchInto(source, directory)
  }
  fs.writeFileSync(
    path.join(dataDirectory, 'revision.json'),
    `${JSON.stringify({ definitions: sources.definitions.revision, points: sources.points.revision, rules: sources.rules.revision }, null, 2)}\n`,
  )
  console.log(`fetched into ${dataDirectory}`)
}
