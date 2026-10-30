import { useMutation } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { dispositionTone } from '../../components/rosterSetup'
import { setLeagueTeamDisposition } from '../../functions'
import { useDispositionNames } from '../battle/setup/chrome'
import { useLeagueRefresh } from './leagueEvent'
import { Problem } from '../../components/Problem'
import { SectionHeading } from '../../components/SectionHeading'

/**
 * The one Force Disposition a fixed pair plays, chosen before the reveal from every card either sealed roster offers.
 *
 * Choosing it here, while the other side's rosters are still hidden, is the point: once the rosters are out it is fixed.
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
  const nameDisposition = useDispositionNames()
  const choose = useMutation({
    mutationFn: (disposition: string) => setLeagueTeamDisposition({ data: { token, eventToken, disposition } }),
    onSettled: refresh,
  })
  const shown = choose.isPending ? choose.variables : team.disposition
  const cards = team.choices.flatMap((id) => nameDisposition(id) ?? [])
  if (!cards.length) return null
  return (
    <section data-team-disposition aria-labelledby="team-disposition" className="border border-edge bg-panel p-4">
      <SectionHeading id="team-disposition" title="Team Force Disposition" className="mb-0" />
      <p className="mt-1 text-xs text-dim">
        {team.disposition
          ? 'Your team plays this card. You can change it until the rosters are revealed.'
          : 'Your team plays one, from any card either roster offers. Choose it before the rosters are revealed.'}
      </p>
      <fieldset className="mt-3 grid gap-2">
        <legend className="sr-only">Force Disposition your team plays</legend>
        {cards.map(({ id, name }) => {
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
              {name}
              <span
                className={`grid size-6 place-items-center rounded-full border ${chosen ? 'border-current bg-bone text-void' : 'border-current/60'}`}
              >
                {chosen ? <Check className="size-4" /> : null}
              </span>
            </button>
          )
        })}
      </fieldset>
      {choose.error ? <Problem error={choose.error} className="mt-2" /> : null}
    </section>
  )
}
