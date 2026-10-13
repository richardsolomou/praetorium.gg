import { useMutation, useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { dispositionTone } from '../../components/rosterSetup'
import { setLeagueTeamDisposition } from '../../functions'
import { gameReferencesQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { useLeagueRefresh } from './leagueEvent'

/**
 * The one Force Disposition a fixed pair plays, chosen before the reveal from every card either sealed list offers.
 *
 * Choosing it here, while the other side's lists are still hidden, is the point: once the lists are out it is fixed.
 */
export function TeamDispositionPanel({
  token,
  eventToken,
  team,
}: {
  token: string
  eventToken: string
  team: { choices: string[]; disposition: string | null }
}) {
  const refresh = useLeagueRefresh(token)
  const { data: references } = useQuery(gameReferencesQuery())
  const choose = useMutation({
    mutationFn: (disposition: string) => setLeagueTeamDisposition({ data: { token, eventToken, disposition } }),
    onSettled: refresh,
  })
  const shown = choose.isPending ? choose.variables : team.disposition
  return (
    <section data-team-disposition aria-labelledby="team-disposition" className="border border-edge bg-panel p-4">
      <h2 id="team-disposition" className="rubric">
        Team Force Disposition
      </h2>
      <p className="mt-1 text-xs text-dim">
        {team.disposition
          ? 'Your team plays this card. You can change it until the lists are revealed.'
          : 'Your team plays one, from any card either list offers. Choose it before the lists are revealed.'}
      </p>
      <fieldset className="mt-3 grid gap-2">
        <legend className="sr-only">Force Disposition your team plays</legend>
        {team.choices.map((id) => {
          const chosen = shown === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={chosen}
              disabled={choose.isPending}
              onClick={() => {
                if (!chosen) choose.mutate(id)
              }}
              className={`flex min-h-12 items-center justify-between border px-3 text-left font-bold uppercase disabled:cursor-wait ${dispositionTone(id, chosen)}`}
            >
              {references?.dispositions.find((disposition) => disposition.id === id)?.name ?? id}
              <span
                className={`grid size-6 place-items-center rounded-full border ${chosen ? 'border-current bg-bone text-void' : 'border-current/60'}`}
              >
                {chosen ? <Check className="size-4" /> : null}
              </span>
            </button>
          )
        })}
      </fieldset>
      {choose.error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {errorMessage(choose.error)}
        </p>
      ) : null}
    </section>
  )
}
