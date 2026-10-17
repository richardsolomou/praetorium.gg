import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { compileCanonicalCatalogueFromSnapshot, loadCanonicalCatalogue } from '../src/server/canonicalCatalogue'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { loadRules } from '../src/server/rules'
import { recordIdsIn, textSourceFiles, textSourcePaths } from '../src/server/sourceTexts'
import { combatUnitsFor } from '../src/shared/combatUnits'
import { hasTextTokens, sourceStrings, type TextPointer } from '../src/shared/sourceText'

const source = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const exists = fs.existsSync(source)
const root = exists ? fs.realpathSync(source) : source

// Agent tools and the reference API read through the app; here it serves the installed snapshot.
const snapshot = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }))
vi.mock('../src/server/app', () => ({ app: () => snapshot.value }))
vi.stubEnv('CATALOGUE_DIR', root)

const { createAgentTools } = await import('../src/server/createAgentTools')
const { referenceRecordResponse, referenceSearchResponse } = await import('../src/server/referenceApi')
const { TEXT_NOT_PUBLISHED } = await import('../src/server/referenceCorpus')

/** Words as compared: markup and spacing never hide a sentence that came from a source file. */
const normal = (text: string) =>
  text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Rules text reads as sentences, where keyword lists, base sizes, and characteristics do not. */
const sentence = (words: string) =>
  words.length >= 60 && /[.!?]/.test(words) && words.split(' ').filter((word) => /^[a-z]/.test(word)).length >= 6

/** Every sentence the snapshot's rules text files hold, the words no answer may carry. */
function sourceProse() {
  const prose = new Set<string>()
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.name.endsWith('.json'))
        for (const value of sourceStrings(JSON.parse(fs.readFileSync(file, 'utf8')))) {
          const words = normal(value)
          if (sentence(words)) prose.add(words)
        }
    }
  }
  for (const directory of ['definitions', 'datacards']) visit(path.join(root, directory))
  return prose
}

/**
 * Each string in a value, and each line of it, as an answer could leak a source sentence
 * through either. Attribution credits a source rather than quoting it, so it is not read.
 */
function stringsIn(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') {
    found.push(value, ...value.split('\n'))
    try {
      if (value.startsWith('{') || value.startsWith('[')) stringsIn(JSON.parse(value), found)
    } catch {
      // Not JSON, so the string and its lines are all it holds.
    }
  } else if (Array.isArray(value)) for (const entry of value) stringsIn(entry, found)
  else if (value && typeof value === 'object')
    for (const [key, entry] of Object.entries(value)) if (key !== 'attribution') stringsIn(entry, found)
  return found
}

/** The names and titles an answer gives, which Praetorium publishes even where one reads like a sentence. */
function namesIn(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('[')))
    try {
      namesIn(JSON.parse(value), found)
    } catch {
      // Not JSON, so it names nothing.
    }
  else if (Array.isArray(value)) for (const entry of value) namesIn(entry, found)
  else if (value && typeof value === 'object')
    for (const [key, entry] of Object.entries(value)) {
      if ((key === 'name' || key === 'title') && typeof entry === 'string') found.add(normal(entry))
      else namesIn(entry, found)
    }
  return found
}

function pointersIn(value: unknown, found: TextPointer[] = []): TextPointer[] {
  if (Array.isArray(value)) for (const entry of value) pointersIn(entry, found)
  else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (Array.isArray(record.textSources)) found.push(...(record.textSources as TextPointer[]))
    for (const [key, entry] of Object.entries(record)) if (key !== 'textSources') pointersIn(entry, found)
  }
  return found
}

describe.skipIf(!exists)('what agents get from Praetorium', () => {
  const answers: { name: string; value: unknown }[] = []
  let prose: Set<string>
  let localFile: Map<string, string>

  beforeAll(async () => {
    const catalogue = loadCatalogue(root)!
    const rules = loadRules(
      root,
      path.join(root, 'battlemaster'),
      path.join(root, 'faction-icons'),
      path.join(root, 'datacards', '11th', 'gdc'),
      catalogue.datacards,
    )
    const canonical = loadCanonicalCatalogue(root) ?? compileCanonicalCatalogueFromSnapshot(catalogue, rules, root)
    snapshot.value = {
      sync: () => ({ status: 'ready' }),
      catalogue: () => catalogue,
      rules: () => rules,
      canonicalCatalogue: () => canonical,
      catalogueFor: async () => catalogue,
      rulesFor: async () => rules,
      canonicalCatalogueFor: async () => canonical,
      combatUnitsFor: async () => combatUnitsFor(catalogue, rules),
    }
    prose = sourceProse()
    localFile = new Map(textSourcePaths(root, readCatalogueComposition(root)).map((file) => [file.url, file.path]))

    const tools = createAgentTools(null)
    const call = async (name: string, input: Record<string, unknown>) =>
      answers.push({ name: `${name} ${JSON.stringify(input)}`, value: await tools.execute(name, input) })
    answers.push({ name: 'list_reference', value: await tools.execute('list_reference', {}) })
    await call('list_factions', {})
    for (const query of ['movement', 'stratagem', 'leader', 'deep strike', 'objective', 'reanimation'])
      await call('search_reference', { query, limit: 25 })
    const { activeReferenceCorpus } = await import('../src/server/referenceApi')
    const corpus = (await activeReferenceCorpus())!
    for (const document of corpus.documents) {
      await call('get_reference', { id: document.id })
      await call('get_reference_record', { id: document.id })
      const api = await referenceRecordResponse(
        new Request(`https://praetorium.gg/api/reference/v1/records/${encodeURIComponent(document.id)}`),
        document.id,
      )
      answers.push({ name: `api record ${document.id}`, value: await api.json() })
    }
    for (const faction of corpus.catalogue.datasheets
      .map((sheet) => sheet.catalogueId)
      .filter((id, index, all) => all.indexOf(id) === index)) {
      const detachment = corpus.catalogue.detachments.find((entry) => entry.catalogueId === faction)?.id
      await call('list_units', { faction, ...(detachment ? { detachment } : {}) })
    }
    const [attacker, defender] = corpus.catalogue.datasheets
    await call('simulate_combat', {
      attacker: { faction: attacker!.catalogueId, unit: attacker!.name },
      defender: { faction: defender!.catalogueId, unit: defender!.name },
    })
    const search = await referenceSearchResponse(new Request('https://praetorium.gg/api/reference/v1/search?q=movement'))
    answers.push({ name: 'api search', value: await search.json() })
  }, 600_000)

  it('carries no rules text and no token', () => {
    const names = new Set(answers.flatMap(({ value }) => [...namesIn(value)]))
    const leaks = answers.flatMap(({ name, value }) =>
      stringsIn(value)
        .filter((text) => hasTextTokens(text) || (prose.has(normal(text)) && !names.has(normal(text))))
        .map((text) => `${name}: ${text.slice(0, 120)}`),
    )
    expect(leaks.slice(0, 20)).toEqual([])
  })

  it('points every withheld text at a pinned upstream file that holds its record', { timeout: 120_000 }, () => {
    const files = Object.values(textSourceFiles(root, readCatalogueComposition(root)))
    const known = new Set(files.map((file) => file.url))
    const pointers = answers.flatMap(({ value }) => pointersIn(value))
    expect(pointers.length).toBeGreaterThan(0)
    const ids = new Map<string, ReadonlySet<string>>()
    const wrong = pointers.filter((pointer) => {
      if (!known.has(pointer.url) || !/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\//.test(pointer.url)) return true
      const file = localFile.get(pointer.url)
      if (!file) return true
      if (!ids.has(file)) ids.set(file, recordIdsIn(file))
      return pointer.id !== undefined && !ids.get(file)!.has(pointer.id)
    })
    expect(wrong.slice(0, 20)).toEqual([])
  })

  it('says where to read every section it withholds', () => {
    const bare = answers.flatMap(({ name, value }) =>
      stringsIn(value).includes(TEXT_NOT_PUBLISHED) && pointersIn(value).length === 0 ? [name] : [],
    )
    expect(bare.slice(0, 20)).toEqual([])
  })
})
