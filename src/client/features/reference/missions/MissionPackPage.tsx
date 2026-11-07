import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { buttonClass } from '../../../components/buttonClass'
import { DispositionChip } from '../../battle/setup/chrome'
import { gameReferencesQuery } from '../../../queries'
import { PageContent, PageHeader } from '../../../components/Page'
import { RuleText } from '../../../components/RuleText'
import { matchupMission } from './dispositionMatchups'
import { SectionHeading } from '../../../components/SectionHeading'
import { RUNNER_COLUMNS } from '../runnerColumns'
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
            <div
              className="grid min-w-[760px] gap-1.5"
              style={{ gridTemplateColumns: `9rem repeat(${data.dispositions.length}, minmax(7rem, 1fr))` }}
            >
              <div className="grid min-h-12 content-end gap-0.5 px-1 pb-1.5 text-2xs font-semibold tracking-label text-faint uppercase">
                <span className="flex items-center gap-1">
                  Opponent <ArrowRight className="size-3" aria-hidden />
                </span>
                <span className="flex items-center gap-1">
                  You <ArrowDown className="size-3" aria-hidden />
                </span>
              </div>
              {data.dispositions.map((entry) => (
                <div key={entry.id} className="grid min-h-12 place-items-end justify-items-center pb-1.5">
                  <DispositionChip disposition={entry} />
                </div>
              ))}
              {data.dispositions.map((you) => (
                <div key={you.id} className="contents">
                  <Link
                    to="/force-dispositions/$dispositionId"
                    params={{ dispositionId: you.id }}
                    className="flex min-h-16 items-center justify-start px-1"
                  >
                    <DispositionChip disposition={you} className="transition-colors hover:border-runner-hi" />
                  </Link>
                  {data.dispositions.map((opponent) => {
                    const found = matchupMission(pack, you.id, opponent.id)
                    return found ? (
                      <Link
                        key={opponent.id}
                        to="/missions/$packId/matchups/$you/$opponent"
                        params={{ packId, you: you.id, opponent: opponent.id }}
                        className="grid min-h-16 place-items-center part px-2 text-center text-sm font-semibold text-balance transition-colors hover:border-runner-hi hover:bg-raised"
                      >
                        {found.name}
                      </Link>
                    ) : (
                      <div
                        key={opponent.id}
                        className="grid min-h-16 place-items-center rounded-xl border border-dashed border-runner text-2xs font-semibold tracking-label text-faint uppercase"
                      >
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
          <div className={`${RUNNER_COLUMNS} [--gate-y:1.375rem] sm:columns-2`}>
            {data.secondaries.map((card) => (
              <Link
                key={card.key}
                to="/missions/$packId/secondaries/$cardId"
                params={{ packId, cardId: card.key }}
                className="flex min-h-11 w-full items-center justify-between gap-2 part px-3 py-2 text-left transition-colors hover:border-runner hover:bg-raised"
              >
                <span className="font-semibold">{card.name}</span>
                {card.awards.some((award) => award.mode === 'fixed') ? <span className="chip shrink-0">Fixed</span> : null}
              </Link>
            ))}
          </div>
        </section>

        {pack.twists.length ? (
          <section>
            <SectionHeading title="Mission twists" count={pack.twists.length} />
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {pack.twists.map((twist) => (
                <article id={`twist-${twist.id}`} key={twist.id} className="scroll-mt-header part p-4">
                  <h3 className="text-lg">{twist.name}</h3>
                  {twist.lore ? <RuleText text={twist.lore} /> : null}
                  {twist.rules ? <RuleText text={twist.rules} className="mt-3 text-base text-bone" /> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </PageContent>
    </main>
  )
}
