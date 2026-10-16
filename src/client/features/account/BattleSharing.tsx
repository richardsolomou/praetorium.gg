import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type BattleAudience, DEFAULT_BATTLE_AUDIENCE } from '../../../core/battleAudience'
import { setBattleAudience } from '../../functions'
import { battleAudienceQuery, friendBattlesQuery, publicBattlesQuery, standingsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { Choice, type ChoiceOption } from '../../components/Choice'

const AUDIENCES: ChoiceOption<BattleAudience>[] = [
  {
    value: 'public',
    name: 'Anyone',
    detail: 'Listed with public games. Finished games count on the leaderboard.',
  },
  { value: 'friends', name: 'Friends', detail: 'Friends of any seated player can watch.' },
  { value: 'private', name: 'Players only', detail: 'Only the seated players can find or watch it.' },
]

export function BattleSharing() {
  const { data: audience } = useQuery(battleAudienceQuery())
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (next: BattleAudience) => setBattleAudience({ data: { audience: next } }),
    // A settings signal from an earlier press may still be refetching the old audience.
    onSuccess: async (next) => {
      await queryClient.cancelQueries({ queryKey: battleAudienceQuery().queryKey })
      queryClient.setQueryData(battleAudienceQuery().queryKey, next)
      void queryClient.invalidateQueries({ queryKey: publicBattlesQuery().queryKey })
      void queryClient.invalidateQueries({ queryKey: friendBattlesQuery().queryKey })
      void queryClient.invalidateQueries({ queryKey: standingsQuery().queryKey })
    },
  })
  return (
    <section
      id="battle-sharing"
      data-onboarding="battle-sharing"
      className="space-y-4 border border-edge bg-panel p-5 md:p-7 lg:col-span-2"
    >
      <div>
        <h2 className="rubric border-b border-edge pb-2">Battle privacy</h2>
        <p className="mt-2 text-sm text-dim">
          Who can watch your past and live battles, league games included. The most private choice at the table applies to everyone.
        </p>
      </div>
      <Choice
        label="Who can watch"
        value={audience ?? DEFAULT_BATTLE_AUDIENCE}
        options={AUDIENCES}
        disabled={save.isPending}
        onChange={(next) => save.mutate(next)}
      />
      {save.error ? <p className="text-sm text-destructive">{errorMessage(save.error)}</p> : null}
    </section>
  )
}
