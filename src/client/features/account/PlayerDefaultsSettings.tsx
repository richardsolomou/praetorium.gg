import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GAME_SIZES } from '../../../core/battle'
import { DEFAULT_PLAYER_DEFAULTS, type PlayerDefaults } from '../../../core/playerDefaults'
import { ROSTER_VISIBILITIES, type RosterVisibility } from '../../../core/savedRoster'
import { setPlayerDefaults } from '../../../server/functions'
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
  count: `${size.limit} points`,
}))

/** Saved on the press like `BattleSharing`; it only changes what the next roster or battle starts with. */
export function PlayerDefaultsSettings() {
  const { data: defaults = DEFAULT_PLAYER_DEFAULTS } = useQuery(playerDefaultsQuery())
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (next: PlayerDefaults) => setPlayerDefaults({ data: next }),
    onSuccess: (next) => queryClient.setQueryData(playerDefaultsQuery().queryKey, next),
  })
  return (
    <section className="space-y-4 border border-edge bg-panel p-5 md:p-7 lg:col-span-2">
      <div>
        <p className="rubric border-b border-edge pb-2">Defaults</p>
        <h2 className="mt-4 text-base">What new rosters and battles start with</h2>
        <p className="mt-1 text-sm text-dim">You can still change either one when you create a roster or set up a battle.</p>
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
