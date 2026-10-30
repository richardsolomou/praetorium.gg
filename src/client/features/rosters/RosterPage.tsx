import { useQuery } from '@tanstack/react-query'
import { fieldedRoster } from './fieldedRoster'
import { BattleRosterSnapshot } from './BattleRosterSnapshot'
import { ListBuilder } from './ListBuilder'
import { NO_PREP } from './rosterDraft'
import { battleQuery, sealedEventRosterQuery, rosterAccessQuery } from '../../queries'
import { FullPageState } from '../../components/PageState'

export function RosterPage({
  id,
  battle,
  sealedEvent,
  event,
  print,
  editable,
  snapshot,
  sealedEventSnapshot,
  requested,
}: {
  id: string
  battle?: string
  sealedEvent?: string
  event?: string
  print?: boolean
  editable: boolean
  snapshot: boolean
  sealedEventSnapshot?: boolean
  requested?: Parameters<typeof ListBuilder>[0]['requested']
}) {
  const { data: screen } = useQuery({ ...battleQuery(battle ?? ''), enabled: snapshot && Boolean(battle) })
  const { data: sealed } = useQuery({
    ...sealedEventRosterQuery(sealedEvent ?? '', event ?? '', id),
    enabled: Boolean(sealedEventSnapshot && sealedEvent),
  })
  const { data: access } = useQuery({ ...rosterAccessQuery(id, battle), enabled: !snapshot })
  const roster = access?.roster

  if (sealedEventSnapshot)
    return sealed ? (
      <BattleRosterSnapshot
        roster={sealed}
        print={print}
        simulatorSource={sealedEvent && event ? { league: { token: sealedEvent, eventToken: event, userId: id } } : undefined}
      />
    ) : null
  if (snapshot && battle && screen && screen.kind !== 'unavailable') {
    const fielded = fieldedRoster(screen.view, id)
    return fielded ? <BattleRosterSnapshot roster={fielded} print={print} /> : null
  }
  if (access === null)
    return <FullPageState eyebrow="404" title="Nothing here" explanation="This roster does not exist or you no longer have access to it." />
  if (!roster) return null
  return (
    <main className="flex h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <ListBuilder
        key={roster.id}
        prep={roster.prep ?? NO_PREP}
        initial={roster}
        initialFaction={access.faction}
        editable={editable && !roster.locked}
        locked={editable && roster.locked}
        print={print}
        battle={battle}
        simulatorSource={access.editable || battle ? undefined : { id: roster.id }}
        variants={access.variants}
        differences={access.differences}
        copiedFrom={access.copiedFrom ?? null}
        lentBy={access.lentBy ?? null}
        requested={requested}
      />
    </main>
  )
}
