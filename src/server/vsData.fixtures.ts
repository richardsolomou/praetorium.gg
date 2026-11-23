import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

type FixtureRecord = {
  kind: string
  id: string
  aliases: string[]
  summary: string
  attribution?: { credit: string; url: string; licence: string }
}

/** The files of a VS Data catalogue release holding `records`, as an archive lays them out. */
export function vsDataReleaseFiles(records: FixtureRecord[], update = 'MFM 1.6'): [string, string][] {
  const rulesVersion = { edition: '11th', update }
  const identity = JSON.stringify({
    formatVersion: 1,
    revision: 1,
    rulesVersion,
    entries: records.map(({ kind, id, aliases, summary }) => ({ kind, id, name: summary.split(' ')[0], aliases })),
  })
  const recordFiles = records.map(({ kind, id, summary, attribution }): [string, string] => [
    `records/rules-reference/${kind}/${id}.json`,
    JSON.stringify({
      formatVersion: 1,
      kind,
      id,
      rulesVersion,
      source: { title: 'An app build' },
      ...(attribution ? { attribution: { ...attribution, revision: 'abc', changes: 'Adapted.' } } : {}),
      data: { summary, citations: [{ type: 'publisher', title: 'A faction pack', url: 'https://example.com/pack.pdf', page: '3' }] },
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
    categories: [
      {
        name: 'rules-reference',
        status: 'partial',
        sources: [],
        records: recordFiles
          .map(([file, text], at) => ({ kind: records[at]!.kind, id: records[at]!.id, path: file, sha256: sha256(text) }))
          .toSorted((left, right) => (`${left.kind}:${left.id}` < `${right.kind}:${right.id}` ? -1 : 1)),
      },
    ],
  })
  return [['manifest.json', manifest], ['identity.json', identity], ...recordFiles]
}

export function writeFiles(directory: string, files: [string, string][]) {
  for (const [file, text] of files) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
    fs.writeFileSync(path.join(directory, file), text)
  }
}
