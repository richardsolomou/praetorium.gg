import { useQuery } from '@tanstack/react-query'
import type { BattleView } from '../../../../core/battleView'
import { Choice } from '../../../components/Choice'
import { battleGroupsQuery } from '../../../queries'
import type { SendCommand } from '../useCommand'

/** Which group's table the battle counts on, offered only once every player shares a group. */
export function GroupChoice({ view, send, disabled }: { view: BattleView; send: SendCommand; disabled: boolean }) {
  const { data } = useQuery(battleGroupsQuery(view.token))
  if (!data || (!data.options.length && !view.groupId)) return null
  const options = data.options.map((group) => ({ value: group.id, name: group.name, detail: 'Goes on the group table' }))
  // A group the players no longer share still names itself, so the choice can be seen and cleared.
  if (view.groupId && !options.some((option) => option.value === view.groupId))
    options.push({ value: view.groupId, name: data.current?.name ?? 'A group', detail: 'Not everyone here is a member now' })
  return (
    <Choice
      label="Group"
      value={view.groupId ?? ''}
      options={[{ value: '', name: 'No group', detail: 'Not for a group table' }, ...options]}
      columns={2}
      disabled={disabled}
      onChange={(groupId) => send({ kind: 'set-battle-club', clubId: groupId || null })}
    />
  )
}
