import { useQuery } from '@tanstack/react-query'
import type { Roster } from '../../core/battle'
import { factionQuery } from '../queries'
import { rosterWaivers } from './FormatWaivers'
import type { FrozenRoster } from '../features/rosters/ListBuilder'
import { RosterEditor } from './RosterEditor'
import { RosterBody, RosterHeader, RosterShell, RosterUnits } from './RosterPresentation'

/**
 * A list as a battle or a league reveal holds it.
 *
 * The roster screen is one screen: a list that still points at a saved row is read
 * through the builder in its read-only state, and one the log froze is read through
 * the same builder with the units and total it was fielded with. Only a list with
 * nothing but its text left — pasted, on a log written before selections were
 * recorded — is drawn here, because there is no roster to draw.
 */
export function BattleRosterSnapshot({ roster }: { roster: Roster }) {
  const built = roster.built
  const factionResult = useQuery({ ...factionQuery(built?.catalogueId ?? ''), enabled: Boolean(built) })
  const faction = factionResult.data
  const reading = rosterReading(roster)

  if (built && reading.kind === 'roster') {
    return (
      <RosterEditor
        roster={{
          id: roster.id ?? '',
          name: roster.name,
          catalogueId: built.catalogueId,
          detachmentIds: built.detachmentIds ?? [],
          disposition: built.disposition,
          limit: built.limit,
          picks: built.picks ?? [],
          waivedRules: built.waivedRules ?? [],
          visibility: 'private',
          source: 'editable',
        }}
        faction={faction}
        editable={false}
        resolvePersistedRoster={false}
        frozen={reading.frozen}
      />
    )
  }

  return (
    <main className="flex h-full w-full flex-col">
      <RosterShell>
        <RosterHeader
          name={roster.name}
          faction={faction}
          factionLoading={Boolean(built) && factionResult.isLoading}
          points={built ? total(built) : undefined}
          limit={built?.limit}
          detachments={detachments(built)}
          disposition={built?.disposition}
          waivers={rosterWaivers(built)}
        />
        <RosterBody>
          <RosterUnits>
            <pre className="my-3 overflow-auto whitespace-pre-wrap border border-edge bg-panel p-3 font-rules text-sm select-text">
              {roster.text}
            </pre>
          </RosterUnits>
        </RosterBody>
      </RosterShell>
    </main>
  )
}

type Built = NonNullable<Roster['built']>

/**
 * Which of the two readings a fielded list gets.
 *
 * A list still pointing at a saved row with its selections is priced as it stands.
 * One the log froze is read with the units and total it was fielded with, as long
 * as those units say what shelf they sit on — a log written before that, or a list
 * that was only ever pasted, has nothing to draw but its text.
 */
export function rosterReading(roster: Roster): { kind: 'text' } | { kind: 'roster'; frozen?: FrozenRoster } {
  const built = roster.built
  if (!built) return { kind: 'text' }
  if (roster.id && built.picks && built.detachmentIds) return { kind: 'roster' }
  if (!built.units.some((unit) => unit.group !== undefined)) return { kind: 'text' }
  return { kind: 'roster', frozen: { units: built.units, points: total(built), detachments: detachments(built) } }
}

const total = (built: Built) => built.units.reduce((points, unit) => points + unit.points, 0)

const detachments = (built: Built | undefined) =>
  (built?.detachments ?? (built?.detachment ? [{ name: built.detachment, points: null }] : [])).map((detachment, index) => ({
    ...detachment,
    id: built?.detachmentIds?.[index],
  }))
