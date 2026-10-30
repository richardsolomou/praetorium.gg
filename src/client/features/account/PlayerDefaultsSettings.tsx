import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GAME_SIZES, pointsLabel } from '../../../core/battle'
import { DEFAULT_PLAYER_DEFAULTS, type PlayerDefaults } from '../../../core/playerDefaults'
import type { RosterVisibility } from '../../../core/savedRoster'
import { setPlayerDefaults } from '../../functions'
import { playerDefaultsQuery } from '../../queries'
import { Choice, type ChoiceOption } from '../../components/Choice'
import { VISIBILITY_NAME, VISIBILITY_REACH } from '../rosters/visibility'
import { Problem } from '../../components/Problem'

const VISIBILITIES: ChoiceOption<RosterVisibility>[] = (['public', 'unlisted', 'private'] as const).map((value) => ({
  value,
  name: VISIBILITY_NAME[value],
  detail: VISIBILITY_REACH[value],
}))

const SIZES: ChoiceOption<string>[] = GAME_SIZES.map((size) => ({
  value: String(size.limit),
  name: size.name,
  count: pointsLabel(size.limit),
}))

/** Saved on the press, showing the choice at once; it changes what the next roster starts with. */
export function PlayerDefaultsSettings() {
  const { data: saved = DEFAULT_PLAYER_DEFAULTS } = useQuery(playerDefaultsQuery())
  const queryClient = useQueryClient()
  const save = useMutation({
    // One at a time, so the last press is the last write.
    scope: { id: 'player-defaults' },
    mutationFn: (next: PlayerDefaults) => setPlayerDefaults({ data: next }),
    // A settings signal from an earlier press may still be refetching the old defaults.
    onSuccess: async (next) => {
      await queryClient.cancelQueries({ queryKey: playerDefaultsQuery().queryKey })
      queryClient.setQueryData(playerDefaultsQuery().queryKey, next)
    },
  })
  const defaults = save.isPending ? save.variables : saved
  return (
    <section className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
      <div>
        <h3 className="text-base">Roster defaults</h3>
        <p className="mt-1 text-sm text-dim">What a new roster starts with. You can change both when you create one.</p>
      </div>
      <div className="space-y-3">
        <Choice
          label="Roster visibility"
          value={defaults.rosterVisibility}
          options={VISIBILITIES}
          onChange={(rosterVisibility) => save.mutate({ ...defaults, rosterVisibility })}
        />
        <Choice
          label="Battle size"
          value={String(defaults.battleSize)}
          options={SIZES}
          columns={2}
          onChange={(size) => save.mutate({ ...defaults, battleSize: Number(size) })}
        />
        {save.error ? <Problem error={save.error} /> : null}
      </div>
    </section>
  )
}
