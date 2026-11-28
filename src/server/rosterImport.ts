import { saveRosterSchema } from '../contracts/schemas'
import { DEFAULT_GAME_LIMIT } from '../core/battle'
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
  importRosterFormat,
} from '../shared/rosterFiles'
import type { CatalogueTranslations } from '../shared/catalogueTranslations'
import { vsFactionOf } from '../shared/factionNames'
import { app } from './app'
import { requireCatalogue } from './requireCatalogue'
import { withinTime } from './timeLimit'

export type Factions = NonNullable<Awaited<ReturnType<ReturnType<typeof app>['factionsFor']>>>['factions']

/** Army text or an exchange code, matched against the rules version it names. */
export async function importRosterInput(file: string) {
  if (isRosterExchangeCode(file)) return importExchangeCode(file)
  return importText(file, (await app().factionsFor())?.factions ?? [])
}

/** The import as save_roster takes it, as the import dialog saves it; null when no faction matched. */
export function importedRosterDraft(imported: Awaited<ReturnType<typeof importRosterInput>>['result']) {
  if (!imported.catalogueId || !imported.source) return null
  const stated = 'limit' in imported && imported.limit ? imported.limit : null
  return saveRosterSchema.parse({
    name: imported.name,
    catalogueId: imported.catalogueId,
    detachmentIds: imported.detachmentIds,
    disposition: 'disposition' in imported ? (imported.disposition ?? null) : null,
    borrowedDetachmentId: 'borrowedDetachmentId' in imported ? imported.borrowedDetachmentId : null,
    limit: stated ?? DEFAULT_GAME_LIMIT,
    pointsBudget: stated !== null && 'pointsBudget' in imported ? imported.pointsBudget : null,
    picks: imported.units,
    waivedRules: 'waivedRules' in imported ? imported.waivedRules : [],
    optionalRules: 'optionalRules' in imported ? imported.optionalRules : [],
    prep: null,
    source: imported.source,
  })
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
    factions.flatMap((candidate) => candidate.bookNames.slice(-1)),
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
    return factions.find((candidate) => matchesImportFaction(name, candidate, translations) && candidate.isDefault) ?? null
  const stated = await factionById(statedCatalogueId)
  return stated && matchesImportFaction(name, stated, translations) ? stated : null
}

/** How long reading one pasted text may hold the server. The slowest of five thousand published lists takes 16 ms. */
const READ_MS = 250

async function importText(file: string, factions: Factions) {
  // The readers' patterns can be made to backtrack for hours by a text built for it, so the first read is timed.
  try {
    withinTime(READ_MS, () => importRosterFormat(file))
  } catch {
    throw new Response('this text takes too long to read as an army list', { status: 400 })
  }
  const instance = app()
  const translations = instance.catalogueTranslations()
  const factionName = importRosterFaction(file)
  const statedCatalogueId = importRosterCatalogueId(file)
  const named = await importedFaction(factionName, statedCatalogueId, factions, translations)
  const base = named || statedCatalogueId ? null : instance.catalogue()
  const byUnits = base ? importRosterUnitFaction(file, base, instance.rules()?.importNames) : null
  const unitsName =
    byUnits && base
      ? (vsFactionOf(base, byUnits.id)?.name ??
        factions.find(({ id, baseCatalogueId }) => id === byUnits.id || baseCatalogueId === byUnits.id)?.bookNames.at(-1))
      : null
  const faction = named ?? (unitsName ? await importedFaction(unitsName, null, factions, translations) : null)
  if (statedCatalogueId && !faction) throw new Response('the exported codex version is not available', { status: 409 })
  const loaded = faction ? await requireCatalogue(faction.id) : null
  const rules = await instance.rulesFor(faction?.id)
  const result = importRosterFile(
    { file },
    loaded,
    factions.flatMap((candidate) => candidate.bookNames.slice(-1)),
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
  return { result: importRosterExchange(exchange, loaded, rules, faction.bookNames.at(-1) ?? faction.displayName), loaded, rules }
}
