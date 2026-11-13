import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'
import { decodeReferencePart } from '../src/contracts/offlineReference'
import { compileCanonicalCatalogueFromSnapshot, loadCanonicalCatalogue } from '../src/server/canonicalCatalogue'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { compiledGlobalSearchIndex, publishedSearchIndex } from '../src/server/globalSearch'
import { referenceDatasheetBySlug, referenceRuleIndex, referenceRuleSection } from '../src/server/referenceCatalogue'
import { loadRules } from '../src/server/rules'
import { battleDetachmentData } from '../src/shared/battleDetachmentData'
import { detachmentReference } from '../src/shared/detachmentReference'
import { unitsIn } from '../src/shared/cataloguePicker'
import { combatUnitsFor } from '../src/shared/combatUnits'
import { factionIndexFor, factionsFor } from '../src/shared/factionReferences'
import { gameReferencesFor } from '../src/shared/gameReferences'
import { pickerUnitsFor } from '../src/shared/pickerUnits'
import { rosterCombatant } from '../src/shared/rosterCombatRules'
import { rosterLoadoutDatasheets } from '../src/shared/rosterReads'
import { checkoutReferenceKey } from './lib/checkoutReferenceKey'
import { prepareReferenceBundle } from './lib/offlineReferenceCache'
import { namesIn, normal, rulesTexts, sourceProse, stringsIn, textCharacteristicTypes } from './lib/sourceProse.fixtures'
import { PUBLIC_REFERENCE_QUERIES } from '../src/contracts/appSnapshot'

const isReferenceQueries = (value: unknown) =>
  Array.isArray(value) &&
  value.every((entry: { key?: unknown[] } | null) => Array.isArray(entry?.key) && PUBLIC_REFERENCE_QUERIES.has(String(entry.key[0])))

const source = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const exists = fs.existsSync(source)
const root = exists ? fs.realpathSync(source) : source

type Payload = { name: string; value: unknown }

/**
 * What the browser receives: published pages, and the construction data a device computes from. Neither
 * carries either source's rules text; the device computes from the facts recorded beside each token.
 */
describe.skipIf(!exists)('what the browser gets from Praetorium', () => {
  const published: Payload[] = []
  const construction: Payload[] = []
  let datacards: Set<string>
  let definitions: Set<string>
  let definitionRules: Set<string>

  beforeAll(async () => {
    const catalogue = loadCatalogue(root)!
    const rules = loadRules(root, { iconDirectory: path.join(root, 'faction-icons'), catalogue })!
    const canonical = loadCanonicalCatalogue(root) ?? compileCanonicalCatalogueFromSnapshot(catalogue, rules, root)
    const sources = { catalogue: () => catalogue, rules: () => rules, canonicalCatalogue: () => canonical }
    definitions = sourceProse(root, ['definitions'])
    const definitionFiles = fs
      .readdirSync(path.join(root, 'definitions'))
      .map((name) => JSON.parse(fs.readFileSync(path.join(root, 'definitions', name), 'utf8')) as unknown)
    const textTypes = textCharacteristicTypes(definitionFiles)
    definitionRules = sourceProse(root, ['definitions'], (parsed) => rulesTexts(parsed, textTypes))
    // A card BSData prints word for word is BSData's text as well, which construction reads may carry.
    datacards = new Set([...sourceProse(root, ['datacards'])].filter((words) => !definitions.has(words)))

    published.push({ name: 'factionIndex', value: factionIndexFor(catalogue, rules) })
    for (const faction of factionsFor(catalogue, rules).factions) published.push({ name: `faction ${faction.id}`, value: faction })
    published.push({ name: 'gameReferences', value: gameReferencesFor(rules) })
    published.push({ name: 'deployments', value: rules.deployments })
    published.push({ name: 'terrain', value: { layouts: rules.terrainLayouts, templates: rules.terrainTemplates } })
    const index = referenceRuleIndex(sources)
    published.push({ name: 'ruleIndex', value: index })
    for (const document of index?.documents ?? [])
      for (const section of document.sections)
        published.push({
          name: `ruleSection ${document.id}/${section.slug}`,
          value: referenceRuleSection(sources, { documentId: document.id, sectionId: section.slug }),
        })
    for (const sheet of canonical.datasheets)
      published.push({
        name: `datasheetBySlug ${sheet.catalogueId}/${sheet.slug}`,
        value: referenceDatasheetBySlug(sources, { catalogueId: sheet.catalogueId, slug: sheet.slug }),
      })
    for (const detachment of canonical.detachments)
      published.push({
        name: `detachmentDetail ${detachment.catalogueId}/${detachment.slug}`,
        value: detachmentReference(catalogue, rules, detachment.catalogueId, detachment.slug),
      })

    construction.push({ name: 'searchIndex', value: publishedSearchIndex(compiledGlobalSearchIndex(catalogue, rules)) })
    construction.push({ name: 'combatUnits', value: combatUnitsFor(catalogue, rules) })
    for (const faction of factionsFor(catalogue, rules).factions) {
      const units = unitsIn(catalogue, faction.id, '', { factionCards: true })
      construction.push({ name: `factionDatasheets ${faction.id}`, value: units })
      construction.push({ name: `units ${faction.id}`, value: pickerUnitsFor(catalogue, rules, faction.id, '', 2000, [], []) })
      construction.push({ name: `detachmentRules ${faction.id}`, value: battleDetachmentData(catalogue, rules, faction.id) })
      for (const unit of units) {
        const data = { catalogueId: faction.id, entryId: unit.id, detachmentIds: [], picks: [], pickIndex: null }
        construction.push({ name: `loadoutDatasheets ${faction.id}/${unit.id}`, value: rosterLoadoutDatasheets(catalogue, data, rules) })
        construction.push({
          name: `combatantDatasheet ${faction.id}/${unit.id}`,
          value: rosterCombatant(catalogue, rules, { ...data, picks: [{ entryId: unit.id }], pickIndex: 0, inactivePicks: [] }),
        })
      }
    }

    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-offline-'))
    try {
      fs.mkdirSync(path.join(out, 'assets'))
      await prepareReferenceBundle(out, await checkoutReferenceKey(root), root)
      for (const file of fs.readdirSync(path.join(out, 'assets'))) {
        const part = decodeReferencePart(gunzipSync(fs.readFileSync(path.join(out, 'assets', file))).toString())
        // Reference queries are published like the service's own responses; search and construction data are not shown as such.
        if (isReferenceQueries(part)) published.push({ name: `offline ${file} queries`, value: part })
        else construction.push({ name: `offline ${file}`, value: part })
      }
    } finally {
      fs.rmSync(out, { recursive: true, force: true })
    }
  }, 1_800_000)

  const leaks = (payloads: Payload[], prose: Set<string>) => {
    const names = new Set(payloads.flatMap(({ value }) => [...namesIn(value)]))
    const found = new Map<string, string>()
    for (const { name, value } of payloads)
      for (const text of stringsIn(value)) {
        const words = normal(text)
        if (prose.has(words) && !names.has(words) && !found.has(words)) found.set(words, `${name}: ${words.slice(0, 120)}`)
      }
    return [...found.values()]
  }

  it('audits every public payload family', () => {
    expect([...new Set(published.map(({ name }) => name.split(' ')[0]!))].sort((left, right) => left.localeCompare(right))).toEqual([
      'datasheetBySlug',
      'deployments',
      'detachmentDetail',
      'faction',
      'factionIndex',
      'gameReferences',
      'offline',
      'ruleIndex',
      'ruleSection',
      'terrain',
    ])
  })

  it('audits every construction payload family', () => {
    expect([...new Set(construction.map(({ name }) => name.split(' ')[0]!))].sort((left, right) => left.localeCompare(right))).toEqual([
      'combatantDatasheet',
      'combatUnits',
      'detachmentRules',
      'factionDatasheets',
      'loadoutDatasheets',
      'offline',
      'searchIndex',
      'units',
    ])
  })

  it('carries no Game Datacards rules text anywhere', { timeout: 120_000 }, () => {
    expect(leaks([...published, ...construction], datacards).slice(0, 20)).toEqual([])
  })

  it('carries no BSData rules text anywhere', { timeout: 120_000 }, () => {
    expect(leaks([...published, ...construction], definitionRules).slice(0, 20)).toEqual([])
  })
})
