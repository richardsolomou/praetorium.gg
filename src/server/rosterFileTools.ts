import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { DEFAULT_GAME_LIMIT } from '../core/battle'
import { rulesVersionLabel } from '../core/catalogueEdition'
import { encodeRosterExchange, ROSTER_EXCHANGE_MAX_CODE_LENGTH } from '../core/rosterExchange'
import { importRosterSchema, saveRosterSchema } from '../contracts/schemas'
import { calculateRosterPrice, savedRosterPriceInput } from '../shared/pricing'
import { exportRosterFile, pricedDispositionNames } from '../shared/rosterFiles'
import { READ_ONLY_TOOL, responseToolError, structured, toolError, type AgentTools } from './agentTools'
import { app } from './app'
import { importRosterInput } from './rosterImport'

type Imported = Awaited<ReturnType<typeof importRosterInput>>['result']

/** A refusal the site shows the player becomes the tool's answer; server faults still throw. */
async function refusalsAsErrors(work: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof Response && error.status < 500) return responseToolError(error)
    throw error
  }
}

/** The import as save_roster takes it, as the import dialog saves it; null when no faction matched. */
function importedDraft(imported: Imported) {
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

async function importReview(imported: Imported) {
  const faction = imported.catalogueId ? await app().factionFor(imported.catalogueId) : null
  return {
    format: imported.format,
    faction: imported.catalogueName?.split(' - ').at(-1) ?? null,
    rulesVersion: faction ? rulesVersionLabel(faction) : null,
    matchedEntries: imported.units.length,
    sourceEntries: imported.sourceUnitCount,
    reportedPoints: imported.reportedPoints,
    currentPoints: imported.currentPoints,
    battleSizeStated: 'limit' in imported && Boolean(imported.limit),
    notImported: imported.unknown,
    builtByDatasheet: imported.unplaced,
    olderData: 'olderData' in imported ? (imported.olderData ?? null) : null,
  }
}

export function registerRosterFileTools(server: AgentTools) {
  server.registerTool(
    'import_roster',
    {
      title: 'Import an army list',
      description:
        "Reads a pasted army list into a roster draft without saving it or needing an account, as the site's import does. Takes the whole text export from the official Warhammer 40,000 app, New Recruit, BattleBase, ListForge, Warscribe, WTC layouts or Praetorium, or a Praetorium exchange code (PR1./PR2.). draft is the list in the shape check_roster and save_roster take, or null when no faction matched. review is what the importing player sees: matchedEntries of sourceEntries, the points the text reported against currentPoints at the selected rules version, notImported (units, detachments or lines left out, each with why) and builtByDatasheet (units that imported but keep their datasheet defaults for the choices named, each with why). Tell the player about every row in both before relying on the draft. When battleSizeStated is false the draft uses 2000 points; ask the player. Anything the import had to assume, such as a unit's god, is named in builtByDatasheet; nothing is substituted silently.",
      inputSchema: { file: importRosterSchema.shape.file.describe('The complete export text, or an exchange code.') },
      annotations: READ_ONLY_TOOL,
    },
    ({ file }) =>
      refusalsAsErrors(async () => {
        const { result } = await importRosterInput(file)
        return structured({ draft: importedDraft(result), review: await importReview(result) })
      }),
  )
  server.registerTool(
    'export_roster',
    {
      title: 'Export a roster as text',
      description:
        "Writes a roster as the site's text export, the official app's layout that tournament organisers and other list builders read, without saving it or needing an account. Takes the shape save_roster takes, such as import_roster's draft or get_my_roster's roster. text is the export; code is a Praetorium exchange code that carries the exact list into Praetorium, or null when the list is too large for one. omittedUnitCount counts entries the current army data no longer prices, which the text leaves out. A name is required. Fails while the army data is unavailable.",
      inputSchema: {
        roster: saveRosterSchema.describe('A complete roster in the shape save_roster takes. Its name must not be empty.'),
      },
      annotations: READ_ONLY_TOOL,
    },
    ({ roster }) =>
      refusalsAsErrors(async () => {
        if (!roster.name) return toolError('validation', 'Name the roster before exporting it.')
        const instance = app()
        const [faction, loaded, rules] = await Promise.all([
          instance.factionFor(roster.catalogueId),
          instance.catalogueFor(roster.catalogueId),
          instance.rulesFor(roster.catalogueId),
        ])
        if (!faction)
          return toolError('validation', 'No army uses this catalogueId. Take it from import_roster, get_my_roster or list_units.')
        const data = { ...savedRosterPriceInput(roster), name: roster.name, pointsBudget: roster.pointsBudget }
        const priced = loaded && calculateRosterPrice(data, loaded, rules)
        if (!loaded || !priced) return toolError('unavailable', 'Praetorium army data for this roster is not available just now.')
        const exported = exportRosterFile(
          data,
          loaded,
          { ...priced, disposition: priced.disposition ?? null },
          pricedDispositionNames(priced, rules),
        )
        const code = await encodeRosterExchange({ ...roster, points: priced.points }).catch(() => null)
        return structured({ ...exported, code: code && code.length <= ROSTER_EXCHANGE_MAX_CODE_LENGTH ? code : null })
      }),
  )
}
