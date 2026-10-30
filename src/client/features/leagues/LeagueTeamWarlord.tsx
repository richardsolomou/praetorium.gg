import { useMutation } from '@tanstack/react-query'
import { Crown } from 'lucide-react'
import { setLeagueTeamWarlord } from '../../functions'
import { useLeagueRefresh } from './leagueEvent'
import { Problem } from '../../components/Problem'
import { SectionHeading } from '../../components/SectionHeading'

/**
 * Whose Warlord leads a fixed pair. Each sealed roster names its own, so either can be played alone, and the pair
 * fields one between them, chosen here before the reveal shows them the other side.
 */
export function TeamWarlordPanel({
  token,
  eventToken,
  viewerId,
  team,
  nameOf,
}: {
  token: string
  eventToken: string
  viewerId: string
  team: { warlordChoices: string[]; warlord: string | null }
  nameOf: (userId: string) => string
}) {
  const refresh = useLeagueRefresh(token)
  const choose = useMutation({
    mutationFn: (userId: string) => setLeagueTeamWarlord({ data: { token, eventToken, userId } }),
    onSettled: refresh,
  })
  const shown = choose.isPending ? choose.variables : team.warlord
  return (
    <section data-team-warlord aria-labelledby="team-warlord" className="border border-edge bg-panel p-4">
      <SectionHeading id="team-warlord" title="Team Warlord" className="mb-0" />
      <p className="mt-1 text-xs text-dim">
        {team.warlord
          ? 'This Warlord leads your team. You can change it until the rosters are revealed.'
          : 'Each roster names its own Warlord, and your team fields one. Choose whose before the rosters are revealed.'}
      </p>
      <fieldset className="mt-3 grid gap-2">
        <legend className="sr-only">Whose Warlord leads your team</legend>
        {team.warlordChoices.map((userId) => {
          const chosen = shown === userId
          return (
            <button
              key={userId}
              type="button"
              aria-pressed={chosen}
              disabled={choose.isPending}
              onClick={() => {
                if (!chosen) choose.mutate(userId)
              }}
              className={`flex min-h-12 items-center justify-between border px-3 text-left font-bold uppercase disabled:cursor-wait ${
                chosen ? 'border-info text-info' : 'border-edge hover:border-info hover:text-bone'
              }`}
            >
              {userId === viewerId ? 'Your Warlord' : `${nameOf(userId)}’s Warlord`}
              <Crown className={`size-4 ${chosen ? 'fill-current' : ''}`} aria-hidden />
            </button>
          )
        })}
      </fieldset>
      {choose.error ? <Problem error={choose.error} className="mt-2" /> : null}
    </section>
  )
}
