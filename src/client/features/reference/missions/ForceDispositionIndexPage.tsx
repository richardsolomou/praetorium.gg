import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { PageContent, PageHeader } from '../../../components/Page'
import { FullPageState, PageState } from '../../../components/PageState'
import { dispositionAccent, dispositionTone } from '../../../components/rosterSetup'
import { dispositionDetachmentsQuery, gameReferencesQuery } from '../../../queries'
import { dispositionMatchups } from './dispositionMatchups'

export function ForceDispositionIndexPage() {
  const { data } = useQuery(gameReferencesQuery())
  const offering = useQueries({
    queries: (data?.dispositions ?? []).map((disposition) => dispositionDetachmentsQuery(disposition.id)),
  })
  if (!data)
    return (
      <FullPageState
        loading
        eyebrow="Force dispositions"
        title="Loading force dispositions"
        explanation="Force dispositions will be available shortly."
      />
    )

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Reference"
        title="Force dispositions"
        description="Your force disposition and your opponent’s set your primary mission."
      />
      <PageContent className="space-y-6">
        {data.dispositions.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {data.dispositions.map((disposition, index) => {
              const factions = offering[index]?.data
              const detachments = factions?.reduce((total, faction) => total + faction.detachments.length, 0) ?? 0
              return (
                <article
                  key={disposition.id}
                  className={`flex flex-col gap-3 border border-t-[3px] border-edge bg-panel p-4 ${dispositionAccent(disposition.id)}`}
                >
                  <Link
                    to="/force-dispositions/$dispositionId"
                    params={{ dispositionId: disposition.id }}
                    className="flex items-center gap-3 hover:text-info"
                  >
                    <h2 className="min-w-0 flex-1 text-lg">{disposition.name}</h2>
                    <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden />
                  </Link>
                  {disposition.text ? <p className="text-sm text-dim">{disposition.text}</p> : null}
                  {dispositionMatchups(data, disposition.id).map(({ pack, matchups }) => (
                    <section key={pack.id} aria-label={`${pack.name} primary missions`}>
                      <h3 className="eyebrow text-dim">Primary missions · {pack.name}</h3>
                      <ul className="mt-1.5 divide-y divide-edge border-y border-edge">
                        {matchups.map(({ opponent, mission }) => (
                          <li key={opponent.id}>
                            <Link
                              to="/missions/$packId/matchups/$you/$opponent"
                              params={{ packId: pack.id, you: disposition.id, opponent: opponent.id }}
                              className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 py-1.5 hover:bg-raised"
                            >
                              <span className={`chip justify-self-start ${dispositionTone(opponent.id)}`}>vs {opponent.name}</span>
                              <span className="min-w-0 text-sm font-bold break-words text-info uppercase">{mission.name}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                  {!factions ? null : factions.length ? (
                    <p className="text-sm text-dim">
                      <span className="readout text-bone">{detachments}</span> {detachments === 1 ? 'detachment' : 'detachments'} in{' '}
                      <span className="readout text-bone">{factions.length}</span> {factions.length === 1 ? 'army' : 'armies'}
                    </p>
                  ) : (
                    <p className="text-sm text-dim">No detachment offers it yet.</p>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <PageState
            headingLevel={2}
            eyebrow="Force dispositions"
            title="No force dispositions available"
            explanation="No force dispositions are available in the current rules."
          />
        )}
      </PageContent>
    </main>
  )
}
