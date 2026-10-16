import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GAME_SIZES } from '../../../core/battle'
import { DEFAULT_PLAYER_DEFAULTS, type PlayerDefaults } from '../../../core/playerDefaults'
import { ROSTER_VISIBILITIES, type RosterVisibility } from '../../../core/savedRoster'
import { setPlayerDefaults } from '../../functions'
import { playerDefaultsQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { Choice, type ChoiceOption } from '../../components/Choice'
import { VISIBILITY_NAME, VISIBILITY_REACH } from '../rosters/visibility'

const VISIBILITIES: ChoiceOption<RosterVisibility>[] = ROSTER_VISIBILITIES.map((value) => ({
  value,
  name: VISIBILITY_NAME[value],
  detail: VISIBILITY_REACH[value],
}))

const SIZES: ChoiceOption<string>[] = GAME_SIZES.map((size) => ({
  value: String(size.limit),
  name: size.name,
  count: `${size.limit.toLocaleString('en')} points`,
}))

/** Saved on the press like `BattleSharing`; it changes what the next roster starts with. */
export function PlayerDefaultsSettings() {
  const { data: defaults = DEFAULT_PLAYER_DEFAULTS } = useQuery(playerDefaultsQuery())
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (next: PlayerDefaults) => setPlayerDefaults({ data: next }),
    // A settings signal from an earlier press may still be refetching the old defaults.
    onSuccess: async (next) => {
      await queryClient.cancelQueries({ queryKey: playerDefaultsQuery().queryKey })
      queryClient.setQueryData(playerDefaultsQuery().queryKey, next)
    },
  })
  return (
    <section className="space-y-4 border border-edge bg-panel p-5 md:p-7 lg:col-span-2">
      <div>
        <h2 className="rubric border-b border-edge pb-2">Roster defaults</h2>
        <p className="mt-2 text-sm text-dim">What a new roster starts with. You can change both when you create one.</p>
      </div>
      <Choice
        label="Roster visibility"
        value={defaults.rosterVisibility}
        options={VISIBILITIES}
        disabled={save.isPending}
        onChange={(rosterVisibility) => save.mutate({ ...defaults, rosterVisibility })}
      />
      <Choice
        label="Battle size"
        value={String(defaults.battleSize)}
        options={SIZES}
        disabled={save.isPending}
        onChange={(size) => save.mutate({ ...defaults, battleSize: Number(size) })}
      />
      {save.error ? <p className="text-sm text-destructive">{errorMessage(save.error)}</p> : null}
    </section>
  )
}
