import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

type FixtureRecord = {
  kind: string
  id: string
  aliases: string[]
  /** A summary record's text; a record of another category gives its `data` instead. */
  summary?: string
  name?: string
  category?: string
  data?: unknown
  attribution?: { credit: string; url: string; licence: string }
}

/** The files of a VS Data catalogue release holding `records`, as an archive lays them out. */
export function vsDataReleaseFiles(records: FixtureRecord[], update = 'MFM 1.6'): [string, string][] {
  const rulesVersion = { edition: '11th', update }
  const identity = JSON.stringify({
    formatVersion: 1,
    revision: 1,
    rulesVersion,
    entries: records.map(({ kind, id, aliases, summary, name }) => ({ kind, id, name: name ?? summary?.split(' ')[0], aliases })),
  })
  const recordFiles = records.map(({ kind, id, summary, attribution, category = 'rules-reference', data }): [string, string] => [
    `records/${category}/${kind}/${id}.json`,
    JSON.stringify({
      formatVersion: 1,
      kind,
      id,
      rulesVersion,
      source: { title: 'An app build' },
      ...(attribution ? { attribution: { ...attribution, revision: 'abc', changes: 'Adapted.' } } : {}),
      data: data ?? {
        summary,
        citations: [{ type: 'publisher', title: 'A faction pack', url: 'https://example.com/pack.pdf', page: '3' }],
      },
    }),
  ])
  const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
  const manifest = JSON.stringify({
    formatVersion: 1,
    release: '0.1.0',
    revision: 1,
    rulesVersion,
    identity: { path: 'identity.json', sha256: sha256(identity) },
    schemas: [],
    categories: [...new Set(['rules-reference', ...records.map((record) => record.category ?? 'rules-reference')])].map((name) => ({
      name,
      status: 'partial',
      sources: [],
      records: recordFiles
        .flatMap(([file, text], at) =>
          (records[at]!.category ?? 'rules-reference') === name
            ? [{ kind: records[at]!.kind, id: records[at]!.id, path: file, sha256: sha256(text) }]
            : [],
        )
        .toSorted((left, right) => (`${left.kind}:${left.id}` < `${right.kind}:${right.id}` ? -1 : 1)),
    })),
  })
  return [['manifest.json', manifest], ['identity.json', identity], ...recordFiles]
}

export function writeFiles(directory: string, files: [string, string][]) {
  for (const [file, text] of files) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
    fs.writeFileSync(path.join(directory, file), text)
  }
}
