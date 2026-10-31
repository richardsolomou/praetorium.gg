import { useQuery } from '@tanstack/react-query'
import { builtDetachments, pointsSpent, type Roster, type BuiltRoster } from '../../../core/battle'
import type { SimulatorRosterSource } from '../../../contracts/simulatorState'
import { factionQuery } from '../../queries'
import { rosterWaivers } from '../../components/FormatWaivers'
import { ListBuilder, type FrozenRoster } from './ListBuilder'
import { NO_PREP } from './rosterDraft'
import { RosterBody, RosterHeader, RosterShell, RosterUnits } from './RosterPresentation'
import { usePrintWhenReady } from './usePrintWhenReady'

/**
 * A list as a battle or a sealed event reveal holds it.
 *
 * The roster screen is one screen: a list that still points at a saved row is read
 * through the builder in its read-only state, and one the log froze is read through
 * the same builder with the units and total it was fielded with. Only a list with
 * nothing but its text left — pasted, on a log written before selections were
 * recorded — is drawn here, because there is no roster to draw.
 */
export function BattleRosterSnapshot({
  roster,
  print,
  simulatorSource,
}: {
  roster: Roster
  print?: boolean
  simulatorSource?: SimulatorRosterSource
}) {
  const built = roster.built
  const factionResult = useQuery({ ...factionQuery(built?.catalogueId ?? ''), enabled: Boolean(built) })
  const faction = factionResult.data
  const reading = rosterReading(roster)
  usePrintWhenReady(Boolean(print) && reading.kind === 'text')

  if (built && reading.kind === 'roster') {
    return (
      <main className="flex h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden">
        <ListBuilder
          key={roster.id ?? ''}
          prep={NO_PREP}
          initial={{
            id: roster.id ?? '',
            name: roster.name,
            catalogueId: built.catalogueId,
            detachmentIds: built.detachmentIds ?? [],
            disposition: built.disposition,
            limit: built.limit,
            pointsBudget: built.pointsBudget ?? null,
            picks: built.picks ?? [],
            waivedRules: built.waivedRules ?? [],
            visibility: 'private',
            source: 'editable',
          }}
          initialFaction={faction}
          snapshotEdition={built.edition ?? null}
          editable={false}
          resolvePersistedRoster={false}
          simulatorSource={simulatorSource}
          print={print}
          frozen={reading.frozen}
        />
      </main>
    )
  }

  return (
    <main className="flex h-full w-full flex-col">
      <RosterShell>
        <RosterHeader
          name={roster.name}
          faction={faction}
          edition={built?.edition ?? null}
          factionLoading={Boolean(built) && factionResult.isLoading}
          points={built ? pointsSpent(built) : undefined}
          limit={built?.limit}
          pointsBudget={built?.pointsBudget}
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

type Built = BuiltRoster

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
  return { kind: 'roster', frozen: { units: built.units, points: pointsSpent(built), detachments: detachments(built) } }
}

const detachments = (built: Built | undefined) =>
  builtDetachments(built).map((detachment, index) => ({
    ...detachment,
    id: built?.detachmentIds?.[index],
  }))
