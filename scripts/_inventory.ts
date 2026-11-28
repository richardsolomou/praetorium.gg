// One-off inventory: every BSData holder whose VS Data record today comes from a name, per rules version. Private output.
import fs from 'node:fs'
import path from 'node:path'
import { editionDirectory, readCatalogueComposition } from '../src/server/catalogueComposition'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { loadRules } from '../src/server/rules'
import { vsDataSummariesSteps, readVsDataRelease } from '../src/server/vsDataSummaries'
import { vsDataTextFacts } from '../src/server/vsDataEffects'
import { snapshotWords } from '../src/server/sourceTexts'
import { completeSteps } from '../src/shared/steps'
import { datasheetIn } from '../src/shared/catalogue'
import { hasTextTokens } from '../src/core/sourceText'
import { unitAbilitySlug } from '../src/core/summaryMarkdown'
import { routeSlug } from '../src/core/slug'
import { canonicalDetachmentName } from '../src/core/detachmentName'
import { summaryNamedBy, wholeRuleTokens, abilityKeysNamed } from '../src/shared/ruleSummaries'
import { datasheetAbilitySummary } from './_vsDataAbilitiesBefore'
import { detachmentReference } from '../src/shared/detachmentReference'
import { factionsFor } from '../src/shared/factionReferences'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = path.resolve(catalogueDataDirectory())
const edition = process.argv[2]!
const entry = readCatalogueComposition(directory)!.editions.find((c) => c.edition.id === edition)!
const folder = entry.base ? directory : editionDirectory(directory, entry)
const { catalogue, rules } = entry.base
  ? loadSnapshotWithRules(directory)
  : (() => {
      const c = loadCatalogue(folder, entry.edition)!
      const r = loadRules(folder, { battlemasterDirectory: path.join(directory, 'battlemaster'), iconDirectory: path.join(directory, 'icons'), snapshotDirectory: directory, rulesVersion: edition, catalogue: c })!
      return { catalogue: c, rules: r }
    })()
const read = completeSteps(vsDataSummariesSteps(directory, rules.ruleDocuments))!
const records = read.recordsIn(entry.base ? null : edition)!
const keywords = read.abilities()
const release = readVsDataRelease(directory, edition)!
const summaryOf = new Map(release.records.map((r) => [`${r.kind}:${r.id}`, r.summary]))
const words = snapshotWords(directory)
const unitOf = (sheet: string) => records.units[sheet]?.id
const factionName = (sheet: string) => catalogue.index.catalogues.get(catalogue.index.catalogueOf.get(sheet) ?? '')?.name ?? ''
const tierOf = (record: string, sheet: string | null, name: string) =>
  /^(core|weapon)-ability:/.test(record) ? 'keyword' : sheet && unitOf(sheet) && record === `ability:${unitOf(sheet)}.${unitAbilitySlug(name)}` ? 'own-exact' : 'other'
const items: Record<string, unknown>[] = []
// Each definitions object by id, for a holder's own description.
const byId = new Map<string, Record<string, unknown>>()
const walk = (o: unknown): void => {
  if (Array.isArray(o)) return o.forEach(walk)
  if (!o || typeof o !== 'object') return
  const r = o as Record<string, unknown>
  if (typeof r.id === 'string' && !byId.has(r.id)) byId.set(r.id, r)
  for (const v of Object.values(r)) if (v && typeof v === 'object') walk(v)
}
for (const { file } of catalogue.definitions!.files) walk(file)
const wordsOfHolder = (id: string) => {
  const o = byId.get(id)
  const description =
    (typeof o?.description === 'string' ? o.description : null) ??
    ((o?.characteristics as { name: string; $text?: string; value?: string }[] | undefined)?.find((c) => c.name === 'Description')?.$text ?? null)
  return description ? catalogue.definitions!.words(description) : null
}
const datasheetIds = new Set([...catalogue.index.datasheets.values()].flatMap((ids) => [...ids]))
const push = (source: string, bsdataId: string, sheet: string | null, sheetName: string, name: string, text: string, current: string) =>
  items.push({ edition, source, bsdataId, sheet, sheetName, faction: sheet ? factionName(sheet) : '', name, words: words(text), current, tier: tierOf(current, sheet, name), summary: summaryOf.get(current) ?? null })

// Datasheet abilities, as reference pages and the builder show them.
const tally: Record<string, number> = {}
const count = (k: string) => (tally[k] = (tally[k] ?? 0) + 1)
const seen = new Set<string>()
for (const faction of catalogue.factions)
  for (const id of catalogue.index.datasheets.get(faction.id) ?? []) {
    const sheet = datasheetIn(catalogue, faction.id, id)
    for (const ability of sheet?.abilities ?? []) {
      const text = ability.description ?? ''
      if (!(hasTextTokens(text) || (!text && ability.name))) continue
      const k = `${id}|${ability.id}|${text}`
      if (seen.has(k)) continue
      seen.add(k)
      const tokens = wholeRuleTokens(text)
      const printed = tokens.length ? summaryNamedBy(tokens, new Map(tokens.map((t) => [t.file, read.summariesIn(t.file)])), ability.name) : null
      const own = datasheetAbilitySummary(records, id, ability.name, ability.id, printed ? { id: printed.id, summary: printed.id } : null)
      const keyword = abilityKeysNamed(ability.name).find((key) => keywords[key]) ?? null
      const current = own ?? keyword
      const alias = records.aliases[ability.id] ? `ability:${records.aliases[ability.id]}` : null
      const unit = unitOf(id)
      const printedOk = printed && (!printed.id.startsWith('ability:') || (unit && printed.id.startsWith(`ability:${unit}.`)) || printed.id.split('.').length < 3) ? printed.id : null
      const nameless = alias ?? printedOk ?? keyword
      if (!current) count(nameless ? 'sheet:gained' : 'sheet:none')
      else if (current === nameless) count('sheet:same')
      else {
        count(`sheet:need:${tierOf(current, id, ability.name)}`)
        push('sheet', ability.id, id, sheet!.name, ability.name, text, current)
      }
    }
  }

// Texts the rules read facts from, joined by name (slice 2's step 3).
const overlay = vsDataTextFacts(directory, edition, path.join(folder, 'datacards', '11th', 'gdc'), catalogue.definitions!, catalogue.index.datasheets)!
for (const key of catalogue.definitions!.facts().keys()) {
  const join = overlay.join(key)
  if (join.by !== 'name' || !join.record) continue
  for (const holder of catalogue.definitions!.holders?.(key) ?? []) {
    const sheets = holder.within.filter((id) => datasheetIds.has(id))
    for (const sheet of sheets.length ? sheets : [null]) {
      count(`facts:need:${tierOf(join.record, sheet, holder.name)}`)
      push('facts', holder.id, sheet, sheet ? (catalogue.index.definitions.get(sheet)?.name ?? '') : '', holder.name, `⟦00000000:${key}⟧`, join.record)
      items.at(-1)!.catalogue = catalogue.index.catalogues.get(holder.catalogue ?? '')?.name ?? holder.catalogue ?? ''
      items.at(-1)!.words = wordsOfHolder(holder.id)
    }
  }
}

// Detachment rules only the catalogue prints.
for (const faction of factionsFor(catalogue, rules).factions)
  for (const d of faction.detachments) {
    if (!faction.referenceDetachmentIds.includes(d.id)) continue
    const ref = detachmentReference(catalogue, rules, faction.id, d.slug)
    for (const rule of ref?.rules ?? []) {
      if (!rule.bsdataId || rule.vsDataId || !rule.description) continue
      const subject = `@${faction.slug}.${routeSlug(canonicalDetachmentName(d.slug))}`
      const tokens = wholeRuleTokens(rule.description)
      const printed = tokens.length ? summaryNamedBy(tokens, new Map(tokens.map((t) => [t.file, read.summariesIn(t.file)])), rule.name) : null
      const current = datasheetAbilitySummary(records, subject, rule.name, undefined, printed ? { id: printed.id, summary: printed.id } : null)
      const alias = records.aliases[rule.bsdataId] ? `ability:${records.aliases[rule.bsdataId]}` : null
      if (!current) count('detachment:none')
      else if (current === alias) count('detachment:same')
      else {
        count('detachment:need')
        items.push({ edition, source: 'detachment', bsdataId: rule.bsdataId, sheet: subject, sheetName: d.name, faction: faction.name, name: rule.name, words: words(rule.description), current, tier: 'other', summary: summaryOf.get(current) ?? null })
      }
    }
  }
fs.mkdirSync('/private/tmp/claude-501/probe2/inventory', { recursive: true })
fs.writeFileSync(`/private/tmp/claude-501/probe2/inventory/${edition}.json`, JSON.stringify(items))
console.log(edition, JSON.stringify(tally))
