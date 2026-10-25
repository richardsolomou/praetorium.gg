import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'
import { decodeReferenceBundle } from '../src/contracts/offlineReference'
import { compileCanonicalCatalogueFromSnapshot, loadCanonicalCatalogue } from '../src/server/canonicalCatalogue'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { compiledGlobalSearchIndex } from '../src/server/globalSearch'
import {
  publishedDetachmentReference,
  publishedFaction,
  referenceDatasheetBySlug,
  referenceRuleIndex,
  referenceRuleSection,
} from '../src/server/referenceCatalogue'
import { loadRules } from '../src/server/rules'
import { battleDetachmentData } from '../src/shared/battleDetachmentData'
import { unitsIn } from '../src/shared/cataloguePicker'
import { combatUnitsFor } from '../src/shared/combatUnits'
import { factionIndexFor, factionsFor } from '../src/shared/factionReferences'
import { gameReferencesFor } from '../src/shared/gameReferences'
import { pickerUnitsFor } from '../src/shared/pickerUnits'
import { rosterCombatant } from '../src/shared/rosterCombatRules'
import { rosterLoadoutDatasheets } from '../src/shared/rosterReads'
import { checkoutReferenceKey } from './lib/checkoutReferenceKey'
import { prepareReferenceBundle } from './lib/offlineReferenceCache'
import { namesIn, normal, sourceProse, stringsIn } from './lib/sourceProse.fixtures'

const source = process.env.CATALOGUE_DIR ?? 'catalogue-data'
const exists = fs.existsSync(source)
const root = exists ? fs.realpathSync(source) : source

type Payload = { name: string; value: unknown }

/**
 * What the browser receives, split by what it may carry. Every payload is free of Game
 * Datacards' words. Pages publish BSData's words as tokens too; what the device computes
 * from keeps them — construction reads for Leader attachments, grants and combat rules, and
 * the search index it matches queries against — and shows them only once the reader turns BSData on.
 */
describe.skipIf(!exists)('what the browser gets from Praetorium', () => {
  const published: Payload[] = []
  const construction: Payload[] = []
  let datacards: Set<string>
  let definitions: Set<string>

  beforeAll(async () => {
    const catalogue = loadCatalogue(root)!
    const rules = loadRules(root, { iconDirectory: path.join(root, 'faction-icons'), loadedDatacards: catalogue.datacards })!
    const canonical = loadCanonicalCatalogue(root) ?? compileCanonicalCatalogueFromSnapshot(catalogue, rules, root)
    const sources = { catalogue: () => catalogue, rules: () => rules, canonicalCatalogue: () => canonical }
    definitions = sourceProse(root, ['definitions'])
    // A card BSData prints word for word is BSData's text as well, which construction reads may carry.
    datacards = new Set([...sourceProse(root, ['datacards'])].filter((words) => !definitions.has(words)))

    published.push({ name: 'factionIndex', value: factionIndexFor(catalogue, rules) })
    for (const faction of factionsFor(catalogue, rules).factions)
      published.push({ name: `faction ${faction.id}`, value: publishedFaction(faction, catalogue) })
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
        value: publishedDetachmentReference(catalogue, rules, detachment.catalogueId, detachment.slug),
      })

    construction.push({ name: 'searchIndex', value: compiledGlobalSearchIndex(catalogue, rules) })
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
        const bundle = decodeReferenceBundle(JSON.parse(gunzipSync(fs.readFileSync(path.join(out, 'assets', file))).toString())) as {
          queries: unknown
          search: unknown
          construction?: unknown
        }
        published.push({ name: `offline ${file} queries`, value: bundle.queries })
        construction.push(
          { name: `offline ${file} search`, value: bundle.search },
          { name: `offline ${file} construction`, value: bundle.construction },
        )
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

  it('publishes no BSData rules text on reference payloads', { timeout: 120_000 }, () => {
    expect(leaks(published, definitions).slice(0, 20)).toEqual([])
  })
})
