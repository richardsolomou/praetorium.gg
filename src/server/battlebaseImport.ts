import { detachmentPointsError } from '../core/battle'
import {
  battlebaseArmy,
  type BattlebaseBattle,
  battlebaseLimit,
  battlebasePack,
  type ImportedArmy,
  type ImportPack,
} from '../core/battlebaseBattle'
import {
  type BattlebaseNames,
  battlebaseRosterSchema,
  battlebaseTextRoster,
  importDetachment,
  importFaction,
  type ImportFaction,
  namedArmy,
  textRosterLines,
} from '../core/battlebaseRoster'
import { rosterSnapshot } from '../core/rosterSnapshot'
import { unitBattleDetailsIn } from '../shared/catalogue'
import { gameReferencesFor } from '../shared/gameReferences'
import { calculateRosterPrice } from '../shared/pricing'
import type { LoadedCatalogue } from '../shared/catalogueIndex'
import { importTextRoster } from '../shared/rosterFiles'
import type { LoadedRules } from '../shared/rules'

export type ImportCatalogue = {
  loaded: LoadedCatalogue
  rules: LoadedRules
  factions: readonly ImportFaction[]
  names: BattlebaseNames
}

/** What replaying one BattleBase battle needs from this app's catalogue and rules. */
export function battlebaseContext(battle: BattlebaseBattle, catalogue: ImportCatalogue) {
  const references = gameReferencesFor(catalogue.rules)
  const packId = battlebasePack(
    battle,
    references.packs.map((pack) => pack.id),
  )
  const held = references.packs.find((pack) => pack.id === packId)
  const pack: ImportPack | null = held
    ? {
        id: held.id,
        secondaries: catalogue.rules.secondaries,
        primaries: held.missions.flatMap((mission) => (mission.card ? [mission.card] : [])),
        deployments: catalogue.rules.deployments,
      }
    : null
  return {
    armies: { creator: army(battle, true, catalogue), opponent: army(battle, false, catalogue) },
    pack,
    // BattleBase's data lists only army stratagems; the core ones are this app's own.
    stratagemNames: [...catalogue.rules.core.map((stratagem) => stratagem.name), ...catalogue.names.stratagems],
  }
}

/**
 * One side's army, rebuilt unit by unit from the catalogue when every unit in it is found there.
 * A choice the catalogue reads differently stays in the list as BattleBase recorded it; a unit
 * it cannot find leaves the whole list as recorded, since an import never drops a unit.
 */
function army(battle: BattlebaseBattle, creator: boolean, { loaded, rules, factions, names }: ImportCatalogue): ImportedArmy {
  const ids = battlebaseArmy(battle, creator)
  const limit = battlebaseLimit(battle)
  const revision = loaded.index.revision
  let parsed: ReturnType<typeof battlebaseRosterSchema.safeParse> | null = null
  try {
    parsed = ids.roster ? battlebaseRosterSchema.safeParse(JSON.parse(ids.roster)) : null
  } catch {
    // An unreadable roster leaves the army named by its faction and detachments.
  }
  const list = parsed?.success ? battlebaseTextRoster(parsed.data, names, limit) : null
  const named = { roster: namedArmy(ids, list, factions, limit, revision), units: {} }
  if (!list || !parsed?.success || limit === null) return named
  const imported = importTextRoster(
    list,
    loaded,
    loaded.factions.map((faction) => faction.name),
  )
  if (!imported.catalogueId || imported.units.length !== list.units.length) return named
  const saved = {
    id: '',
    name: list.name,
    catalogueId: imported.catalogueId,
    detachmentIds: imported.detachmentIds,
    disposition: 'disposition' in imported ? (imported.disposition ?? null) : null,
    limit,
    picks: imported.units,
    waivedRules: [],
  }
  const priced = calculateRosterPrice({ ...saved, units: saved.picks }, loaded, rules)
  if (!priced) return named
  const { id: _id, ...snapshot } = rosterSnapshot(
    saved,
    priced,
    unitBattleDetailsIn(
      loaded,
      saved.catalogueId,
      saved.picks.map((pick) => pick.entryId),
    ),
  )
  const built = snapshot.built!
  // Detachments the catalogue does not hold are still named, so the army reads as it was played.
  const faction = importFaction(ids.faction, factions).faction
  const detachments = ids.detachments.flatMap((id) => importDetachment(id, faction, factions) ?? [])
  const known = new Set(built.detachments?.map((detachment) => detachment.name))
  built.detachments = [
    ...(built.detachments ?? []),
    ...detachments.filter((name) => !known.has(name)).map((name) => ({ name, points: null })),
  ]
  built.detachment = built.detachments[0]?.name ?? null
  if (detachmentPointsError(built.detachments, built.detachmentPointBudget ?? null)) delete built.detachmentPointBudget
  return {
    roster: { ...snapshot, text: textRosterLines({ ...list, detachment: built.detachments.map((one) => one.name).join(', ') }).join('\n') },
    units: Object.fromEntries(
      priced.units.flatMap((unit, at) => {
        const source = parsed.data.units[unit.key]
        const key = built.units[at]?.key
        return source && key ? [[source.id, key]] : []
      }),
    ),
  }
}
