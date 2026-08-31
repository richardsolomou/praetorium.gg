import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type BattleAudience, DEFAULT_BATTLE_AUDIENCE } from '../../core/battleAudience'
import { setBattleAudience } from '../../server/functions'
import { battleAudienceQuery, friendBattlesQuery, publicBattlesQuery, standingsQuery } from '../queries'
import { errorMessage } from '../queryClient'
import { Choice, type ChoiceOption } from './Choice'

/**
 * What each answer means, in terms of who can actually reach the battle.
 *
 * Worded as consequences rather than levels, because the choice is only useful if
 * a player can tell what changes: what a stranger sees, and what the leaderboard
 * counts.
 */
const AUDIENCES: ChoiceOption<BattleAudience>[] = [
  {
    value: 'public',
    name: 'Anyone',
    detail:
      'Your battles appear on the home page and count towards the leaderboard. Anyone can watch, and nobody can take a seat or change anything.',
  },
  { value: 'friends', name: 'Friends', detail: 'Only your confirmed friends see your battles listed or can watch one.' },
  { value: 'private', name: 'Only my table', detail: 'Nobody outside the battle sees it, and none of your battles are counted anywhere.' },
]

/**
 * Who may watch this player's battles.
 *
 * Saved on the press rather than behind the profile form's Save, because it is a
 * setting rather than an edit: there is nothing to review before it takes effect,
 * and the answer applies to games already being played. It narrows every battle
 * this player sits in — `battleAudience` in the domain takes the strictest answer
 * at the table, so this cannot expose a game somebody else has withheld.
 */
export function BattleSharing() {
  const { data: audience } = useQuery(battleAudienceQuery())
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (next: BattleAudience) => setBattleAudience({ data: { audience: next } }),
    onSuccess: (next) => {
      queryClient.setQueryData(battleAudienceQuery().queryKey, next)
      // The feeds and the standings are answers to "who may see what", so they are
      // now wrong on this device as well as everyone else's.
      void queryClient.invalidateQueries({ queryKey: publicBattlesQuery().queryKey })
      void queryClient.invalidateQueries({ queryKey: friendBattlesQuery().queryKey })
      void queryClient.invalidateQueries({ queryKey: standingsQuery().queryKey })
    },
  })
  return (
    <section className="mx-auto mt-8 max-w-3xl space-y-4 border-t border-edge px-3 pt-6 sm:px-4">
      <div>
        <p className="rubric border-b border-edge pb-2">Who can watch your battles</p>
        <p className="mt-3 text-xs text-dim">
          A battle takes the strictest answer of everyone in it, so an opponent who keeps their battles private keeps yours together private
          too. Watching is read-only either way: a spectator never sees a face-down Secret Mission and cannot act.
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
