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
    detail:
      'Anyone can watch unless another player chooses a narrower audience. Public games without practice opponents appear in the battle list. Finished ones count towards the leaderboard.',
  },
  { value: 'friends', name: 'Friends', detail: 'Confirmed friends of any seated player can watch, unless someone chooses Players only.' },
  { value: 'private', name: 'Players only', detail: 'Only the players seated in a battle can find or watch it.' },
]

export function BattleSharing() {
  const { data: audience } = useQuery(battleAudienceQuery())
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (next: BattleAudience) => setBattleAudience({ data: { audience: next } }),
    onSuccess: (next) => {
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
        <p className="rubric border-b border-edge pb-2">Privacy</p>
        <h2 className="mt-4 text-base">Who can watch your battles</h2>
        <p className="mt-1 text-sm text-dim">
          Changes apply immediately to past and live battles, including league battles. The most private choice at the table applies to
          everyone. Spectators cannot make changes or see a face-down Secret Mission.
        </p>
      </div>
      <Choice
        label="Audience"
        value={audience ?? DEFAULT_BATTLE_AUDIENCE}
        options={AUDIENCES}
        disabled={save.isPending}
        onChange={(next) => save.mutate(next)}
      />
      {save.error ? <p className="text-sm text-destructive">{errorMessage(save.error)}</p> : null}
    </section>
  )
}
