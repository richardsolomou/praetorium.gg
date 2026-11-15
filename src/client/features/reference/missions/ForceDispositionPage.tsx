import { FactionReferenceLink } from '../../../components/FactionReferenceLink'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { BackLink } from '../BackLink'
import { Skeleton } from '@/components/ui/skeleton'
import { dispositionTone } from '../../../components/rosterSetup'
import { dispositionDetachmentsQuery, gameReferencesQuery } from '../../../queries'
import { FactionMark } from '../../../components/FactionMark'
import { PageContent, PageHeader } from '../../../components/Page'
import { dispositionMatchups } from '../../../../shared/gameReferences'
import { SectionHeading } from '../../../components/SectionHeading'
import { DISPOSITION_PACK_SECTION } from '../../../../contracts/reference'

export function ForceDispositionPage({ dispositionId }: { dispositionId: string }) {
  const { data } = useQuery(gameReferencesQuery())
  const { data: factions } = useQuery(dispositionDetachmentsQuery(dispositionId))
  const disposition = data?.dispositions.find((entry) => entry.id === dispositionId)
  if (!data || !disposition) return null
  const packs = dispositionMatchups(data, dispositionId)
  const detachmentCount = factions?.reduce((total, faction) => total + faction.detachments.length, 0) ?? 0

  return (
    <main className="w-full">
      <PageHeader title={disposition.name} description={disposition.text} />
      <PageContent className="space-y-8">
        <BackLink to="/missions">Missions</BackLink>
        {packs.map(({ pack, matchups }) => (
          <section key={pack.id} id={`${DISPOSITION_PACK_SECTION}${pack.id}`} className="scroll-mt-header">
            <SectionHeading
              title="Primary missions"
              detail={
                <Link
                  to="/missions/$packId"
                  params={{ packId: pack.id }}
                  className="text-xs font-normal tracking-normal text-dim normal-case underline decoration-runner-hi underline-offset-4 hover:text-bone"
                >
                  {pack.name}
                </Link>
              }
            />
            <div className="mt-3 runner gap-1.5 [--gate-y:1.375rem]">
              {matchups.map(({ opponent, mission }) => (
                <Link
                  key={opponent.id}
                  to="/missions/$packId/matchups/$you/$opponent"
                  params={{ packId: pack.id, you: dispositionId, opponent: opponent.id }}
                  className="grid min-h-11 grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-3 part px-3 py-2 transition-colors hover:border-runner hover:bg-raised sm:grid-cols-[12rem_minmax(0,1fr)]"
                >
                  <span className={`chip justify-self-start ${dispositionTone(opponent.id)}`}>vs {opponent.name}</span>
                  <span className="min-w-0 font-semibold break-words">{mission.name}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section id="detachments" className="scroll-mt-header">
          <SectionHeading title="Detachments" count={factions ? detachmentCount : undefined} />
          {!factions ? (
            <div aria-busy className="mt-3 grid gap-3 md:grid-cols-2">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ) : factions.length ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {factions.map((faction) => (
                <article key={faction.slug} className="part">
                  <FactionReferenceLink
                    to="/factions/$catalogueId"
                    params={{ catalogueId: faction.slug }}
                    className="flex min-h-11 items-center gap-2 border-b border-edge px-3 py-2 font-bold hover:bg-raised"
                  >
                    <FactionMark faction={faction} size="sm" />
                    <span className="min-w-0 truncate">{faction.displayName}</span>
                  </FactionReferenceLink>
                  <ul className="py-1">
                    {faction.detachments.map((detachment) => (
                      <li key={detachment.slug}>
                        <FactionReferenceLink
                          to="/factions/$catalogueId/detachments/$detachmentId"
                          params={{ catalogueId: faction.slug, detachmentId: detachment.slug }}
                          className="flex min-h-9 items-center justify-between gap-3 px-3 py-1.5 text-sm hover:bg-raised"
                        >
                          <span className="min-w-0 truncate">{detachment.name}</span>
                          {detachment.points === null ? null : <span className="chip shrink-0">{detachment.points} DP</span>}
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
