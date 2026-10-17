import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GAME_SIZES, pointsLabel } from '../../../core/battle'
import { DEFAULT_PLAYER_DEFAULTS, type PlayerDefaults } from '../../../core/playerDefaults'
import { ROSTER_VISIBILITIES, type RosterVisibility } from '../../../core/savedRoster'
import { setPlayerDefaults } from '../../functions'
import { playerDefaultsQuery } from '../../queries'
import { Choice, type ChoiceOption } from '../../components/Choice'
import { VISIBILITY_NAME, VISIBILITY_REACH } from '../rosters/visibility'
import { Problem } from '../../components/Problem'
import { SettingsSection } from './SettingsSection'

const VISIBILITIES: ChoiceOption<RosterVisibility>[] = ROSTER_VISIBILITIES.map((value) => ({
  value,
  name: VISIBILITY_NAME[value],
  detail: VISIBILITY_REACH[value],
}))

const SIZES: ChoiceOption<string>[] = GAME_SIZES.map((size) => ({
  value: String(size.limit),
  name: size.name,
  count: pointsLabel(size.limit),
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
    <SettingsSection title="Roster defaults" description="What a new roster starts with. You can change both when you create one.">
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
      {save.error ? <Problem error={save.error} /> : null}
    </SettingsSection>
  )
}
