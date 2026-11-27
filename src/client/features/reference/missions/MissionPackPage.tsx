import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { buttonClass } from '../../../components/buttonClass'
import { dispositionTag, OUTLINE_TAG } from '../../../components/rosterSetup'
import { gameReferencesQuery } from '../../../queries'
import { PageContent, PageHeader } from '../../../components/Page'
import { RuleSummarySkeleton, RuleSummaryText } from '../../../components/RuleSummaryText'
import { useMissionSummary } from '../../../ruleSummaries'
import type { MissionTwist } from '../../../../contracts/missions'
import { matchupMission } from '../../../../shared/gameReferences'
import { SectionHeading } from '../../../components/SectionHeading'
import { GuideHelp } from '../../onboarding/GuideHelp'

export function MissionPackPage({ packId }: { packId: string }) {
  const { data } = useQuery(gameReferencesQuery())
  const pack = data?.packs.find((entry) => entry.id === packId)
  if (!data || !pack) return null
  // The highest any mission in the pack states, and only what one of them actually
  // states. Read as a pair per category, because nothing says the two must agree.
  const missions = pack.missions
  const capOf = (pick: (mission: (typeof missions)[number]) => number | null | undefined) =>
    Math.max(0, ...missions.map((entry) => pick(entry) ?? 0))
  const allowance = (label: string, game: number, round: number) =>
    game ? [`${label} up to ${game} VP${round ? `, at most ${round} a round` : ''}`] : []
  const allowances = [
    ...allowance(
      'Primary missions',
      capOf((entry) => entry.gameCap),
      capOf((entry) => entry.roundCap),
    ),
    ...allowance(
      'Secondary missions',
      capOf((entry) => entry.secondaryGameCap),
      capOf((entry) => entry.secondaryRoundCap),
    ),
  ]

  return (
    <main className="w-full">
      <PageHeader
        title={pack.name}
        help={<GuideHelp task="reference">Search help</GuideHelp>}
        actions={
          <Link to="/rosters/new" search={{ reference: 'mission-pack' }} className={buttonClass()}>
            Build a roster
          </Link>
        }
      >
        {allowances.length ? <p className="readout mt-1 text-xs text-dim">{allowances.join(' · ')}</p> : null}
      </PageHeader>
      <PageContent className="space-y-6">
        <section id="matrix">
          <SectionHeading title="Force dispositions" />
          <p className="text-sm text-dim">Your disposition down the left, your opponent’s across the top.</p>
          {/* Bleeds to the window on a phone, so the cut-off column reads as a scroller. */}
          <div className="-mx-3 mt-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
            {/* The hairlines are the edge colour showing through one-pixel gaps between cells that paint the page's own background. */}
            <div
              className="grid min-w-[760px] gap-px border-y border-edge bg-edge"
              style={{ gridTemplateColumns: `9rem repeat(${data.dispositions.length}, minmax(7rem, 1fr))` }}
            >
              <div className="eyebrow grid min-h-12 content-end gap-0.5 bg-void px-2 pb-2">
                <span className="flex items-center gap-1">
                  Opponent <ArrowRight className="size-3" aria-hidden />
                </span>
                <span className="flex items-center gap-1">
                  You <ArrowDown className="size-3" aria-hidden />
                </span>
              </div>
              {data.dispositions.map((entry) => (
                <div key={entry.id} className="grid min-h-12 place-items-end justify-items-center bg-void pb-2">
                  <span data-disposition={entry.id} className={dispositionTag(entry.id)}>
                    {entry.name}
                  </span>
                </div>
              ))}
              {data.dispositions.map((you) => (
                <div key={you.id} className="contents">
                  <Link
                    to="/force-dispositions/$dispositionId"
                    params={{ dispositionId: you.id }}
                    className="flex min-h-16 items-center justify-start bg-void px-2 hover:bg-raised"
                  >
                    <span data-disposition={you.id} className={dispositionTag(you.id)}>
                      {you.name}
                    </span>
                  </Link>
                  {data.dispositions.map((opponent) => {
                    const found = matchupMission(pack, you.id, opponent.id)
                    return found ? (
                      <Link
                        key={opponent.id}
                        to="/missions/$packId/matchups/$you/$opponent"
                        params={{ packId, you: you.id, opponent: opponent.id }}
                        className="grid min-h-16 place-items-center bg-void px-2 text-center text-sm font-medium text-balance text-bone transition-colors hover:bg-raised hover:text-info"
                      >
                        {found.name}
                      </Link>
                    ) : (
                      <div key={opponent.id} className="grid min-h-16 place-items-center bg-void text-xs text-faint">
                        Unavailable
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <SectionHeading title="Secondary missions" count={data.secondaries.length} />
          <div className="border-t border-edge sm:columns-2 sm:gap-x-6">
            {data.secondaries.map((card) => (
              <Link
                key={card.key}
                to="/missions/$packId/secondaries/$cardId"
                params={{ packId, cardId: card.slug }}
                className="flex min-h-11 w-full break-inside-avoid items-center justify-between gap-2 border-b border-edge px-2 py-2 text-left transition-colors hover:bg-raised"
              >
                <span className="font-medium text-bone">{card.name}</span>
                {card.awards.some((award) => award.mode === 'fixed') ? (
                  <span className={`${OUTLINE_TAG} border-edge text-dim`}>Fixed</span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>

        {pack.twists.length ? (
          <section>
            <SectionHeading title="Mission twists" count={pack.twists.length} />
            <div className="grid border-t border-edge md:grid-cols-2 md:gap-x-6">
              {pack.twists.map((twist) => (
                <TwistReference key={twist.id} twist={twist} />
              ))}
            </div>
          </section>
        ) : null}
      </PageContent>
    </main>
  )
}

function TwistReference({ twist }: { twist: MissionTwist }) {
  const { summary, pending } = useMissionSummary('mission-twist', twist.id)
  return (
    <article id={`twist-${twist.id}`} className="scroll-mt-header border-b border-edge py-4">
      <h3 className="text-lg">{twist.name}</h3>
      {summary ? (
        <RuleSummaryText summary={summary} className="mt-2 text-base text-dim" />
      ) : pending ? (
        <RuleSummarySkeleton className="mt-2" />
      ) : null}
    </article>
  )
}
