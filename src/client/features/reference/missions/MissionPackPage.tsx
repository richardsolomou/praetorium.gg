import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { buttonClass } from '../../../components/buttonClass'
import { dispositionTone } from '../../../components/rosterSetup'
import { gameReferencesQuery } from '../../../queries'
import { PageContent, PageHeader } from '../../../components/Page'
import { RuleText } from '../../../components/RuleText'
import { matchupMission } from './dispositionMatchups'
import { SectionHeading } from '../../../components/SectionHeading'

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
        eyebrow="Mission pack"
        title={pack.name}
        actions={
          <>
            <Link to="/rosters/new" search={{ reference: 'mission-pack' }} className={buttonClass()}>
              Build a roster
            </Link>
            <Link to="/force-dispositions" className={buttonClass({ variant: 'outline' })}>
              Force dispositions
            </Link>
          </>
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
              <div className="grid min-h-14 place-items-center border border-edge bg-sunken text-center text-xs font-bold text-dim uppercase">
                Opponent →<br />
                You ↓
              </div>
              {data.dispositions.map((entry) => (
                <div
                  key={entry.id}
                  className={`grid min-h-14 place-items-center border px-2 text-center text-xs font-bold uppercase ${dispositionTone(entry.id, true)}`}
                >
                  {entry.name}
                </div>
              ))}
              {data.dispositions.map((you) => (
                <div key={you.id} className="contents">
                  <Link
                    to="/force-dispositions/$dispositionId"
                    params={{ dispositionId: you.id }}
                    className={`grid min-h-16 place-items-center border px-2 text-center text-xs font-bold uppercase hover:underline ${dispositionTone(you.id, true)}`}
                  >
                    {you.name}
                  </Link>
                  {data.dispositions.map((opponent) => {
                    const found = matchupMission(pack, you.id, opponent.id)
                    return found ? (
                      <Link
                        key={opponent.id}
                        to="/missions/$packId/matchups/$you/$opponent"
                        params={{ packId, you: you.id, opponent: opponent.id }}
                        className="grid min-h-16 place-items-center border border-edge bg-panel px-2 text-center text-sm font-bold text-info uppercase hover:border-info hover:bg-raised"
                      >
                        {found.name}
                      </Link>
                    ) : (
                      <div key={opponent.id} className="grid min-h-16 place-items-center border border-edge bg-sunken text-xs text-faint">
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
          <div className="grid gap-px border border-edge bg-panel sm:grid-cols-2">
            {data.secondaries.map((card) => (
              <Link
                key={card.key}
                to="/missions/$packId/secondaries/$cardId"
                params={{ packId, cardId: card.key }}
                className="flex w-full items-center justify-between bg-panel px-3 py-2 text-left font-bold uppercase ring-1 ring-edge hover:bg-raised hover:text-info"
              >
                <span>{card.name}</span>
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
                <article id={`twist-${twist.id}`} key={twist.id} className="scroll-mt-header border border-edge bg-panel p-4">
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
