import { useQuery } from '@tanstack/react-query'
import { Label } from '@/components/ui/label'
import type { BattleView } from '../../../../core/battleView'
import { SearchableSelect, ungrouped } from '../../../components/SearchableSelect'
import { battleGroupsQuery } from '../../../queries'
import type { SendCommand } from '../useCommand'

/** No account id is this, so it stands for no group in a control that needs a value for every option. */
const NO_GROUP = 'none'

/** Which group's table the battle counts on, offered only once every player shares a group. */
export function GroupChoice({
  view,
  send,
  disabled,
  className,
}: {
  view: BattleView
  send: SendCommand
  disabled: boolean
  className?: string
}) {
  const { data } = useQuery(battleGroupsQuery(view.token))
  if (!data || (!data.options.length && !view.groupId)) return null
  const options = data.options.map((group) => ({ value: group.id, label: group.name }))
  // A group the players no longer share still names itself, so the choice can be seen and cleared.
  if (view.groupId && !options.some((option) => option.value === view.groupId))
    options.push({ value: view.groupId, label: `${data.current?.name ?? 'A group'} (not everyone is a member now)` })
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Label htmlFor="battle-group" className="eyebrow shrink-0">
          Record for a group
        </Label>
        <SearchableSelect
          id="battle-group"
          ariaLabel="Record for a group"
          groups={ungrouped([{ value: NO_GROUP, label: 'No group' }, ...options])}
          value={view.groupId ?? NO_GROUP}
          onValueChange={(groupId) => send({ kind: 'set-battle-group', groupId: groupId === NO_GROUP ? null : groupId })}
          placeholder="No group"
          searchPlaceholder="Search groups…"
          disabled={disabled}
          className="h-10 min-w-0 flex-1 sm:max-w-xs"
        />
      </div>
    </div>
  )
}
