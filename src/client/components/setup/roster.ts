import type { Roster } from '../../../core/battle'
import type { savedRosterPrice } from '../../../server/functions'
import type { savedRostersQuery } from '../../queries'

export type SavedRoster = Awaited<ReturnType<NonNullable<ReturnType<typeof savedRostersQuery>['queryFn']>>>[number]
type PricedRoster = NonNullable<Awaited<ReturnType<typeof savedRosterPrice>>>

/**
 * The list as the battle keeps it: the text an opponent reads on any device, and the
 * priced selections behind it. Cards are settled by the battle rather than carried
 * in with the list, so nothing about prep comes across here.
 */
export function battleRoster(saved: SavedRoster, priced: PricedRoster): Roster {
  return {
    name: saved.name,
    text: [
      `${priced.points} / ${saved.limit} pts`,
      ...priced.detachments.map(
        (detachment, index) => `${index ? 'Detachment' : 'Primary detachment'}: ${detachment.name} (${detachment.points ?? '?'} DP)`,
      ),
      '',
      ...priced.units.map((unit) => `${unit.name}${unit.size.resizable ? ` (${unit.size.models})` : ''} — ${unit.points}`),
    ].join('\n'),
    built: {
      catalogueId: saved.catalogueId,
      revision: priced.revision,
      limit: saved.limit,
      detachment: priced.detachment,
      detachments: priced.detachments,
      detachmentPointBudget: priced.detachmentPointBudget,
      disposition: priced.disposition,
      selections: priced.selections,
      units: priced.units.map((unit, index) => ({
        key: `${index}-${unit.entryId}`,
        name: unit.name,
        points: unit.points,
        models: unit.size.models,
        formationOptions: [...unit.formationOptions],
        prebattleRules: unit.prebattleRules,
      })),
    },
  }
}
