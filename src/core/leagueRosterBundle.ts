import { GAME_SIZES, type Roster } from './battle'
import { gwTextGroup, gwTextVersionLines, toGwText } from './gwText'
import { textNickname } from './textRoster'

export const SEALED_COPIES_NOTICE = 'Sealed copies as revealed; later edits to players’ saved rosters are not included.'

/** An entrant's sealed list, or why the file has none of theirs, so nobody drops out unnoticed. */
export type BundledRoster = { player: string } & ({ roster: Roster; faction: string } | { absent: string })

/**
 * An event's revealed lists in one readable text file, headed by the event, when it was captured and what it holds.
 *
 * Each list is written from its sealed cards and totals, never repriced against today's data.
 */
export function leagueRosterBundle({
  event,
  capturedAt,
  rosters,
  dispositionName,
  version,
}: {
  event: string
  capturedAt: Date
  rosters: readonly BundledRoster[]
  dispositionName: (id: string) => string
  version: string
}) {
  const sections = rosters.map((entry) =>
    [
      `===== ${entry.player} =====`,
      '',
      'absent' in entry ? entry.absent : sealedRosterText(entry.roster, entry.faction, dispositionName, version).trimEnd(),
    ].join('\n'),
  )
  return [[event, `Captured ${capturedAt.toISOString()}`, SEALED_COPIES_NOTICE].join('\n'), ...sections].join('\n\n') + '\n'
}

function sealedRosterText(roster: Roster, faction: string, dispositionName: (id: string) => string, version: string) {
  const built = roster.built
  if (!built) return roster.text
  const keys = built.units.map((unit) => unit.key)
  const dispositions = built.disposition ? [built.disposition] : (built.dispositions ?? [])
  const text = toGwText(
    {
      name: roster.name,
      faction,
      detachments: built.detachments ?? (built.detachment ? [{ name: built.detachment, points: null }] : []),
      dispositions: dispositions.map(dispositionName),
      size: GAME_SIZES.find((size) => size.limit === built.limit)?.name ?? 'Battle',
      limit: built.limit,
      ...(built.pointsBudget ? { pointsBudget: built.pointsBudget } : {}),
      points: built.units.reduce((total, unit) => total + unit.points, 0),
      units: built.units.map((unit, index) => {
        const host = unit.attachedTo === undefined ? -1 : keys.indexOf(unit.attachedTo)
        return {
          name: unit.name,
          nickname: textNickname(unit.nickname ?? ''),
          models: unit.models,
          entry: index + 1,
          attachedToEntry: host === -1 ? undefined : host + 1,
          points: unit.points,
          group: gwTextGroup(unit.group ?? 'other'),
          warlord: unit.warlord ?? false,
          joined: unit.joined ?? [],
          enhancements: unit.enhancements ?? [],
          upgrades: unit.upgrades ?? [],
          wargear: unit.wargear ?? [],
        }
      }),
    },
    version,
  )
  return text + gwTextVersionLines(built.edition, built.catalogueId)
}
