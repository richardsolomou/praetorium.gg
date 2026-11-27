import type { VsPick } from '../core/roster'
import { vsFirstPick } from '../core/unitChoices'
import type { LoadedCatalogue } from './catalogueIndex'
import { vsDefinitionsOf, vsUnitIdOf } from './vsDataBuild'
import native from './vsNativeUnits.json' with { type: 'json' }

/** Datasheets the builder offers what the catalogue does, by `scripts/vsDataChoiceParity.ts`, or differs only where VS Data follows the app. */
const NATIVE: ReadonlySet<string> = new Set(native)

/**
 * The pick a newly added unit starts as, by VS Data IDs, for a datasheet the builder fields by VS Data: as its datasheet
 * first fields it in the list's book and Detachments. Any other datasheet starts as the catalogue builds it.
 */
export function vsFirstPickOf(
  loaded: LoadedCatalogue,
  list: { catalogueId: string; detachmentIds: readonly string[] },
  entryId: string,
): VsPick | undefined {
  const definitions = vsDefinitionsOf(loaded)
  const unit = vsUnitIdOf(loaded, list.catalogueId, entryId)
  if (!definitions || !unit || !NATIVE.has(unit)) return undefined
  const roster = {
    faction: loaded.vsRoster?.books[list.catalogueId.slice(list.catalogueId.indexOf('~') + 1)] ?? '',
    detachments: list.detachmentIds.flatMap((id) => loaded.vsRoster?.detachments[id] ?? []),
  }
  const { unit: _unit, size: _size, models = {}, options = {}, ...held } = vsFirstPick(definitions, unit, { roster })
  return { models, options, ...held }
}
