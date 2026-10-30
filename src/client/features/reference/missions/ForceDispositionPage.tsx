import { FactionReferenceLink } from '../../../components/FactionReferenceLink'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { dispositionTone } from '../../../components/rosterSetup'
import { dispositionDetachmentsQuery, gameReferencesQuery } from '../../../queries'
import { FactionMark } from '../../../components/FactionMark'
import { PageContent, PageHeader } from '../../../components/Page'
import { dispositionMatchups } from './dispositionMatchups'
import { SectionHeading } from '../../../components/SectionHeading'

export function ForceDispositionPage({ dispositionId }: { dispositionId: string }) {
  const { data } = useQuery(gameReferencesQuery())
  const { data: factions } = useQuery(dispositionDetachmentsQuery(dispositionId))
  const disposition = data?.dispositions.find((entry) => entry.id === dispositionId)
  if (!data || !disposition) return null
  const packs = dispositionMatchups(data, dispositionId)
  const detachmentCount = factions?.reduce((total, faction) => total + faction.detachments.length, 0) ?? 0

  return (
    <main className="w-full">
      <PageHeader
        eyebrow={
          <Link to="/force-dispositions" className="text-info hover:text-bone">
            Force dispositions
          </Link>
        }
        title={disposition.name}
        description={disposition.text}
      />
      <PageContent className="space-y-6">
        {packs.map(({ pack, matchups }) => (
          <section key={pack.id}>
            <SectionHeading
              title="Primary missions"
              detail={
                <Link to="/missions/$packId" params={{ packId: pack.id }} className="eyebrow text-info hover:text-bone">
                  {pack.name}
                </Link>
              }
            />
            <div className="mt-3 grid gap-px border border-edge bg-edge">
              {matchups.map(({ opponent, mission }) => (
                <Link
                  key={opponent.id}
                  to="/missions/$packId/matchups/$you/$opponent"
                  params={{ packId: pack.id, you: dispositionId, opponent: opponent.id }}
                  className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-3 bg-panel px-3 py-2 hover:bg-raised sm:grid-cols-[12rem_minmax(0,1fr)]"
                >
                  <span className={`chip justify-self-start ${dispositionTone(opponent.id)}`}>vs {opponent.name}</span>
                  <span className="min-w-0 text-sm font-bold break-words text-info uppercase sm:text-base">{mission.name}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section>
          <SectionHeading title="Detachments" count={factions ? detachmentCount : undefined} />
          {!factions ? (
            <div aria-busy className="mt-3 grid gap-3 md:grid-cols-2">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ) : factions.length ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {factions.map((faction) => (
                <article key={faction.slug} className="border border-edge bg-panel">
                  <FactionReferenceLink
                    to="/factions/$catalogueId"
                    params={{ catalogueId: faction.slug }}
                    className="flex items-center gap-2 border-b border-edge px-3 py-2 font-bold uppercase hover:bg-raised hover:text-info"
                  >
                    <FactionMark faction={faction} size="sm" />
                    <span className="min-w-0 truncate">{faction.displayName}</span>
                  </FactionReferenceLink>
                  <ul>
                    {faction.detachments.map((detachment) => (
                      <li key={detachment.slug}>
                        <FactionReferenceLink
                          to="/factions/$catalogueId/detachments/$detachmentId"
                          params={{ catalogueId: faction.slug, detachmentId: detachment.slug }}
                          className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm hover:bg-raised hover:text-info"
                        >
                          <span className="min-w-0 truncate">{detachment.name}</span>
                          {detachment.points === null ? null : <span className="chip shrink-0 text-info">{detachment.points} DP</span>}
                        </FactionReferenceLink>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <p className="py-2 text-sm text-dim">No detachment in the current data offers {disposition.name}.</p>
          )}
        </section>
      </PageContent>
    </main>
  )
}
