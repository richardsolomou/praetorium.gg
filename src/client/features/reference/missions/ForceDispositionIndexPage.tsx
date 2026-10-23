import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { PageContent, PageHeader } from '../../../components/Page'
import { FullPageState, PageState } from '../../../components/PageState'
import { dispositionAccent } from '../../../components/rosterSetup'
import { FactionMark } from '../../../components/FactionMark'
import { dispositionDetachmentsQuery, gameReferencesQuery } from '../../../queries'

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
                <Link
                  key={disposition.id}
                  to="/force-dispositions/$dispositionId"
                  params={{ dispositionId: disposition.id }}
                  className={`flex items-start gap-3 border border-t-[3px] border-edge bg-panel p-4 transition-colors hover:border-info hover:bg-raised ${dispositionAccent(disposition.id)}`}
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg">{disposition.name}</h2>
                    {disposition.text ? <p className="mt-3 text-sm text-dim">{disposition.text}</p> : null}
                    {!factions ? null : factions.length ? (
                      <>
                        <p className="mt-3 text-sm text-dim">
                          <span className="readout text-bone">{detachments}</span> {detachments === 1 ? 'detachment' : 'detachments'} in{' '}
                          <span className="readout text-bone">{factions.length}</span> {factions.length === 1 ? 'army' : 'armies'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {factions.map((faction) => (
                            <FactionMark key={faction.slug} id={faction.slug} name={faction.displayName} icon={faction.icon} size="sm" />
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-dim">No detachment offers it yet.</p>
                    )}
                  </div>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-dim" aria-hidden />
                </Link>
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
