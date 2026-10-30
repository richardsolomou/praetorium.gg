import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { catalogueSources } from './catalogueSources'
import type { CatalogueComposition } from './catalogueComposition'
import { publishedTexts, sourceTexts, textFileId, textRecordsIn, textSourceFiles, upstreamUrl, withDefinitionTokens } from './sourceTexts'
import { resolvedText, textTokensIn } from '../shared/sourceText'

const base = {
  ...catalogueSources,
  definitions: { ...catalogueSources.definitions, repository: 'owner/definitions', revision: 'd'.repeat(40) },
  datacards: { ...catalogueSources.datacards, repository: 'owner/datacards', revision: 'c'.repeat(40) },
}
const fork = { repository: 'owner/fork', branch: 'codex', revision: 'f'.repeat(40), license: null }
const composition = {
  format: 'praetorium.catalogue-composition.v1',
  baseSources: base,
  overlays: [{ source: 'datacards', ...fork, files: ['11th/gdc/custodes.json'] }],
  editions: [
    {
      edition: { id: 'codex', name: 'Codex', status: 'released', default: false, catalogueIds: ['a'], releases: [] },
      sources: { definitions: { ...fork, revision: 'e'.repeat(40) } },
      overlays: [],
    },
    {
      edition: { id: 'retained', name: 'Retained', status: 'retired', default: false, catalogueIds: ['b'], releases: [] },
      snapshot: { format: 'praetorium.catalogue-pointer.v1', id: '1'.repeat(64), archiveSha256: '2'.repeat(64) },
      sources: {},
      overlays: [],
    },
  ],
} as unknown as CatalogueComposition

const raw = (repository: string, revision: string, file: string) => `https://raw.githubusercontent.com/${repository}/${revision}/${file}`

describe('where a snapshot file lives upstream', () => {
  it('reads a root file from the root source', () => {
    expect(upstreamUrl('datacards/11th/gdc/necrons.json', composition)).toBe(
      raw('owner/datacards', 'c'.repeat(40), '11th/gdc/necrons.json'),
    )
  })

  it('reads an overlaid file from the overlay', () => {
    expect(upstreamUrl('datacards/11th/gdc/custodes.json', composition)).toBe(raw('owner/fork', 'f'.repeat(40), '11th/gdc/custodes.json'))
  })

  it('reads an edition file from the source that edition replaces', () => {
    expect(upstreamUrl('editions/codex/definitions/Necrons.json', composition)).toBe(raw('owner/fork', 'e'.repeat(40), 'Necrons.json'))
  })

  it('reads an edition file it does not replace from the root', () => {
    expect(upstreamUrl('editions/codex/datacards/11th/gdc/custodes.json', composition)).toBe(
      raw('owner/fork', 'f'.repeat(40), '11th/gdc/custodes.json'),
    )
  })

  it('finds no upstream for an edition kept whole from an older snapshot', () => {
    expect(upstreamUrl('editions/retained/datacards/11th/gdc/necrons.json', composition)).toBeNull()
  })

  it('finds no upstream for a file outside the text sources', () => {
    expect(upstreamUrl('battlemaster/layouts.json', composition)).toBeNull()
  })
})

describe('the tokens a parser publishes', () => {
  const upstream = raw('owner/datacards', 'c'.repeat(40), '11th/gdc/necrons.json')
  const texts = sourceTexts(upstream)
  const token = texts('Re-roll a Hit roll of 1.', 'prose')

  it('carries no words of the source', () => {
    expect(token).not.toContain('Hit roll')
  })

  it('names the file it came from', () => {
    expect(textTokensIn(token)[0]?.file).toBe(textFileId(upstream))
  })

  it('names the hash of the exact source string', () => {
    expect(textTokensIn(token)[0]?.hash).toBe(createHash('sha256').update('Re-roll a Hit roll of 1.').digest('hex').slice(0, 16))
  })

  it('resolves to the string a lookup finds for its hash', () => {
    expect(
      resolvedText(
        `**Effect:** ${token}`,
        () => 'Re-roll a Hit roll of 1.',
        () => '',
      ),
    ).toBe('**Effect:** Re-roll a Hit roll of 1.')
  })
})

describe('the files a reader can load', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-text-files-'))
  for (const file of ['datacards/11th/gdc/necrons.json', 'editions/codex/definitions/Necrons.json', 'battlemaster/layouts.json']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), '{}')
  }
  const files = textSourceFiles(root, composition)

  it('lists a root file at its upstream address', () => {
    const url = raw('owner/datacards', 'c'.repeat(40), '11th/gdc/necrons.json')
    expect(files[textFileId(url)]).toEqual({ url, source: 'game-datacards' })
  })

  it('lists a rules version’s own file', () => {
    const url = raw('owner/fork', 'e'.repeat(40), 'Necrons.json')
    expect(files[textFileId(url)]).toEqual({ url, source: 'bsdata' })
  })

  it('lists nothing outside the text sources', () => {
    expect(Object.keys(files)).toHaveLength(2)
  })
})

describe('the records holding a file’s texts', () => {
  const hashOf = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16)
  const records = (parsed: unknown) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-text-records-')), 'file.json')
    fs.writeFileSync(file, JSON.stringify(parsed))
    return textRecordsIn(file)
  }

  it('names no record for a text the file holds by its own id', () => {
    expect(records({ id: 'catalogue', name: 'Words.' }).get(hashOf('Words.'))).toBeUndefined()
  })

  it('names the innermost record holding a text', () => {
    expect(records({ id: 'catalogue', rules: [{ id: 'rule', description: 'Words.' }] }).get(hashOf('Words.'))).toEqual(['rule'])
  })

  it('names a top-level record in a file with no id of its own', () => {
    expect(records({ stratagems: [{ id: 'stratagem', effect: 'Words.' }] }).get(hashOf('Words.'))).toEqual(['stratagem'])
  })

  it('names a detachment rule by the detachment it belongs to', () => {
    expect(records({ id: 'faction', rules: [{ detachment_id: 'detachment', rule: 'Words.' }] }).get(hashOf('Words.'))).toEqual([
      'detachment',
    ])
  })
})

describe('the tokens a snapshot file publishes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-published-texts-'))
  fs.writeFileSync(
    path.join(root, 'composition.json'),
    JSON.stringify({
      format: 'praetorium.catalogue-composition.v1',
      baseSources: catalogueSources,
      overlays: [],
      editions: [
        {
          edition: {
            id: 'codex',
            name: 'Codex',
            status: 'released',
            default: false,
            catalogueIds: ['a'],
            releases: [{ at: 1, status: 'released' }],
          },
          sources: {},
          overlays: [],
        },
      ],
    }),
  )
  const token = (file: string) => publishedTexts(path.join(root, file))('Re-roll a Hit roll of 1.', 'prose')

  it('is the same for a rules version’s unchanged copy of a file, so the copies share one text', () => {
    expect(token('editions/codex/datacards/11th/gdc/necrons.json')).toBe(token('datacards/11th/gdc/necrons.json'))
  })

  it('names the file by its upstream address', () => {
    expect(textTokensIn(token('datacards/11th/gdc/necrons.json'))[0]?.file).toBe(
      textFileId(raw(catalogueSources.datacards.repository, catalogueSources.datacards.revision, '11th/gdc/necrons.json')),
    )
  })
})

describe('publishing a canonical record', () => {
  const token = (text: string) => (text.startsWith('While') ? `⟦0000000a:prose:${'1'.repeat(16)}⟧` : null)

  it('swaps a rule-like profile’s characteristic for its token', () => {
    const profile = { kind: 'other', values: [{ name: 'Ability', value: 'While a friendly unit is within 6", re-roll the Hit roll.' }] }
    expect(withDefinitionTokens({ profiles: [profile] }, token).profiles[0]!.values[0]!.value).toBe(`⟦0000000a:prose:${'1'.repeat(16)}⟧`)
  })

  it('keeps a unit profile’s characteristics as numbers', () => {
    const profile = { kind: 'unit', values: [{ name: 'M', value: 'While 6"' }] }
    expect(withDefinitionTokens({ profiles: [profile] }, token).profiles[0]!.values[0]!.value).toBe('While 6"')
  })
})
