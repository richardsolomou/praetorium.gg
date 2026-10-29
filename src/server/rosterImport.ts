import { decodeRosterExchange, isRosterExchangeCode, ROSTER_EXCHANGE_RULES_UNAVAILABLE, RosterExchangeError } from '../core/rosterExchange'
import type { TextRoster } from '../core/textRoster'
import {
  importParsedRoster,
  importRosterCatalogueId,
  importRosterExchange,
  importRosterFaction,
  importRosterFile,
  matchesImportFaction,
  type RosterTextFormat,
} from '../shared/rosterFiles'
import { app } from './app'

export type Factions = NonNullable<Awaited<ReturnType<ReturnType<typeof app>['factionsFor']>>>['factions']

/** Army text or an exchange code, matched against the rules version it names. */
export async function importRosterInput(file: string) {
  if (isRosterExchangeCode(file)) return importExchangeCode(file)
  return importText(file, (await app().factionsFor())?.factions ?? [])
}

/** A list another app already read into army text, matched against the current rules for its faction as pasted text is. */
export async function importParsedList(parsed: TextRoster, format: RosterTextFormat, factions: Factions) {
  const instance = app()
  const faction = await importedFaction(parsed.faction, null, factions)
  const loaded = faction ? await instance.catalogueFor(faction.id) : null
  if (faction && !loaded) throw new Response('army data is not available', { status: 409 })
  const rules = await instance.rulesFor(faction?.id)
  return importParsedRoster(
    parsed,
    format,
    loaded,
    factions.map((candidate) => candidate.name),
    rules,
  )
}

/** The book saved under exactly this ID, including exact root IDs the faction index lists only qualified. */
async function factionById(catalogueId: string) {
  const faction = await app().factionFor(catalogueId)
  return faction?.id === catalogueId ? faction : null
}

async function importedFaction(name: string | null, statedCatalogueId: string | null, factions: Factions) {
  if (!name) return null
  if (!statedCatalogueId) return factions.find((candidate) => matchesImportFaction(name, candidate.name) && candidate.isDefault) ?? null
  const stated = await factionById(statedCatalogueId)
  return stated && matchesImportFaction(name, stated.name) ? stated : null
}

async function importText(file: string, factions: Factions) {
  const instance = app()
  const factionName = importRosterFaction(file)
  const statedCatalogueId = importRosterCatalogueId(file)
  const faction = await importedFaction(factionName, statedCatalogueId, factions)
  if (statedCatalogueId && !faction) throw new Response('the exported codex version is not available', { status: 409 })
  const loaded = faction ? await instance.catalogueFor(faction.id) : null
  if (faction && !loaded) throw new Response('army data is not available', { status: 409 })
  const rules = await instance.rulesFor(faction?.id)
  const result = importRosterFile(
    { file },
    loaded,
    factions.map((candidate) => candidate.name),
    rules,
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
  const loaded = await instance.catalogueFor(faction.id)
  if (!loaded) throw new Response('army data is not available', { status: 409 })
  const rules = await instance.rulesFor(faction.id)
  return { result: importRosterExchange(exchange, loaded, rules, faction.name), loaded, rules }
}
