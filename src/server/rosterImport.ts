import { decodeRosterExchange, isRosterExchangeCode, ROSTER_EXCHANGE_RULES_UNAVAILABLE, RosterExchangeError } from '../core/rosterExchange'
import {
  importRosterCatalogueId,
  importRosterExchange,
  importRosterFaction,
  importRosterFile,
  matchesImportFaction,
} from '../shared/rosterFiles'
import { app } from './app'

type Factions = NonNullable<Awaited<ReturnType<ReturnType<typeof app>['factionsFor']>>>['factions']

/** Army text or an exchange code, matched against the rules version it names. */
export async function importRosterInput(file: string) {
  const factions = (await app().factionsFor())?.factions ?? []
  return isRosterExchangeCode(file) ? importExchangeCode(file, factions) : importText(file, factions)
}

async function importText(file: string, factions: Factions) {
  const instance = app()
  const factionName = importRosterFaction(file)
  const statedCatalogueId = importRosterCatalogueId(file)
  const faction = factionName
    ? factions.find(
        (candidate) =>
          matchesImportFaction(factionName, candidate.name) &&
          (statedCatalogueId ? candidate.id === statedCatalogueId : candidate.isDefault),
      )
    : null
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

async function importExchangeCode(code: string, factions: Factions) {
  const instance = app()
  const exchange = await decodeRosterExchange(code).catch((error: unknown) => {
    throw error instanceof RosterExchangeError ? new Response(error.message, { status: 400 }) : error
  })
  const faction = factions.find((candidate) => candidate.id === exchange.catalogueId)
  if (!faction) throw new Response(ROSTER_EXCHANGE_RULES_UNAVAILABLE, { status: 409 })
  const loaded = await instance.catalogueFor(faction.id)
  if (!loaded) throw new Response('army data is not available', { status: 409 })
  const rules = await instance.rulesFor(faction.id)
  return { result: importRosterExchange(exchange, loaded, rules, faction.name), loaded, rules }
}
