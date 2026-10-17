import { useQuery } from '@tanstack/react-query'
import { fieldedRoster } from './fieldedRoster'
import { BattleRosterSnapshot } from './BattleRosterSnapshot'
import { RosterEditor } from './RosterEditor'
import { battleQuery, leagueRosterQuery, rosterAccessQuery } from '../../queries'
import { FullPageState } from '../../components/PageState'

export function RosterPage({
  id,
  battle,
  league,
  event,
  print,
  editable,
  snapshot,
  leagueSnapshot,
  requested,
}: {
  id: string
  battle?: string
  league?: string
  event?: string
  print?: boolean
  editable: boolean
  snapshot: boolean
  leagueSnapshot?: boolean
  requested?: Parameters<typeof RosterEditor>[0]['requested']
}) {
  const { data: screen } = useQuery({ ...battleQuery(battle ?? ''), enabled: snapshot && Boolean(battle) })
  const { data: sealed } = useQuery({
    ...leagueRosterQuery(league ?? '', event ?? '', id),
    enabled: Boolean(leagueSnapshot && league),
  })
  const { data: access } = useQuery({ ...rosterAccessQuery(id, battle), enabled: !snapshot })
  const roster = access?.roster

  if (leagueSnapshot) return sealed ? <BattleRosterSnapshot roster={sealed} print={print} /> : null
  if (snapshot && battle && screen && screen.kind !== 'unavailable') {
    const fielded = fieldedRoster(screen.view, id)
    return fielded ? <BattleRosterSnapshot roster={fielded} print={print} /> : null
  }
  if (access === null)
    return <FullPageState eyebrow="404" title="Nothing here" explanation="This roster does not exist or you no longer have access to it." />
  if (!roster) return null
  return (
    <RosterEditor
      roster={roster}
      faction={access.faction}
      editable={editable && !roster.locked}
      locked={editable && roster.locked}
      print={print}
      battle={battle}
      variants={access.variants}
      differences={access.differences}
      copiedFrom={access.copiedFrom ?? null}
      lentBy={access.lentBy ?? null}
      requested={requested}
    />
  )
}
