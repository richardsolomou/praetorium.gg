import { decodeRosterExchange, isRosterExchangeCode, ROSTER_EXCHANGE_RULES_UNAVAILABLE, RosterExchangeError } from '../core/rosterExchange'
import type { TextRoster } from '../core/textRoster'
import {
  importParsedRoster,
  importRosterCatalogueId,
  importRosterExchange,
  importRosterFaction,
  importRosterFile,
  importRosterUnitFaction,
  matchesImportFaction,
  type RosterTextFormat,
} from '../shared/rosterFiles'
import type { CatalogueTranslations } from '../shared/catalogueTranslations'
import { app } from './app'
import { requireCatalogue } from './requireCatalogue'

export type Factions = NonNullable<Awaited<ReturnType<ReturnType<typeof app>['factionsFor']>>>['factions']

/** Army text or an exchange code, matched against the rules version it names. */
export async function importRosterInput(file: string) {
  if (isRosterExchangeCode(file)) return importExchangeCode(file)
  return importText(file, (await app().factionsFor())?.factions ?? [])
}

/** A list another app already read into army text, matched against the current rules for its faction as pasted text is. */
export async function importParsedList(parsed: TextRoster, format: RosterTextFormat, factions: Factions) {
  const instance = app()
  const translations = instance.catalogueTranslations()
  const faction = await importedFaction(parsed.faction, null, factions, translations)
  const loaded = faction ? await requireCatalogue(faction.id) : null
  const rules = await instance.rulesFor(faction?.id)
  return importParsedRoster(
    parsed,
    format,
    loaded,
    factions.map((candidate) => candidate.name),
    rules,
    translations,
    instance.catalogueRemovals(),
  )
}

/** The book saved under exactly this ID, including exact root IDs the faction index lists only qualified. */
async function factionById(catalogueId: string) {
  const faction = await app().factionFor(catalogueId)
  return faction?.id === catalogueId ? faction : null
}

async function importedFaction(
  name: string | null,
  statedCatalogueId: string | null,
  factions: Factions,
  translations: CatalogueTranslations,
) {
  if (!name) return null
  if (!statedCatalogueId)
    return factions.find((candidate) => matchesImportFaction(name, candidate.name, translations) && candidate.isDefault) ?? null
  const stated = await factionById(statedCatalogueId)
  return stated && matchesImportFaction(name, stated.name, translations) ? stated : null
}

async function importText(file: string, factions: Factions) {
  const instance = app()
  const translations = instance.catalogueTranslations()
  const factionName = importRosterFaction(file)
  const statedCatalogueId = importRosterCatalogueId(file)
  const named = await importedFaction(factionName, statedCatalogueId, factions, translations)
  const base = named || statedCatalogueId ? null : instance.catalogue()
  const byUnits = base ? importRosterUnitFaction(file, base) : null
  const faction = named ?? (byUnits ? await importedFaction(byUnits.name, null, factions, translations) : null)
  if (statedCatalogueId && !faction) throw new Response('the exported codex version is not available', { status: 409 })
  const loaded = faction ? await requireCatalogue(faction.id) : null
  const rules = await instance.rulesFor(faction?.id)
  const result = importRosterFile(
    { file },
    loaded,
    factions.map((candidate) => candidate.name),
    rules,
    translations,
    instance.catalogueRemovals(),
  )
  return { result, loaded, rules }
}

async function importExchangeCode(code: string) {
  const instance = app()
  const exchange = await decodeRosterExchange(code).catch((error: unknown) => {
    throw error instanceof RosterExchangeError ? new Response(error.message, { status: 400 }) : error
  })
  const faction = await factionById(exchange.catalogueId)
  if (!faction) throw new Response(ROSTER_EXCHANGE_RULES_UNAVAILABLE, { status: 409 })
  const loaded = await requireCatalogue(faction.id)
  const rules = await instance.rulesFor(faction.id)
  return { result: importRosterExchange(exchange, loaded, rules, faction.name), loaded, rules }
}
