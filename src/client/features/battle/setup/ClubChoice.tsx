import { useQuery } from '@tanstack/react-query'
import type { BattleView } from '../../../../core/battleView'
import { Choice } from '../../../components/Choice'
import { battleClubsQuery } from '../../../queries'
import type { SendCommand } from '../useCommand'

/** Which club's table the battle counts on, offered only once every player shares a club. */
export function ClubChoice({ view, send, disabled }: { view: BattleView; send: SendCommand; disabled: boolean }) {
  const { data } = useQuery(battleClubsQuery(view.token))
  if (!data || (!data.options.length && !view.clubId)) return null
  const options = data.options.map((club) => ({ value: club.id, name: club.name, detail: 'Goes on the club table' }))
  // A club the players no longer share still names itself, so the choice can be seen and cleared.
  if (view.clubId && !options.some((option) => option.value === view.clubId))
    options.push({ value: view.clubId, name: data.current?.name ?? 'A club', detail: 'Not everyone here is a member now' })
  return (
    <Choice
      label="Club"
      value={view.clubId ?? ''}
      options={[{ value: '', name: 'No club', detail: 'Not for a club table' }, ...options]}
      columns={2}
      disabled={disabled}
      onChange={(clubId) => send({ kind: 'set-battle-club', clubId: clubId || null })}
    />
  )
}
