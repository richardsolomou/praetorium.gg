import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Info, RotateCcw } from 'lucide-react'
import { leagueFormat, type LeagueEntryView } from '../../../core/league'
import { buttonClass } from '../../components/buttonClass'
import { PageContent, PageHeader } from '../../components/Page'
import { pageLinkTabClass, pageLinkTabsClass } from '../../components/PageTabs'
import { SectionHeading } from '../../components/SectionHeading'
import { meQuery } from '../../queries'
import { countLabel } from '../../text'
import { CreateLeague } from './CreateLeague'
import { EventSchedule } from './EventSchedule'
import { LeagueArmies } from './LeagueArmies'
import { EntrantList, EntrantRow, sealStatus } from './LeagueEntrants'
import { entryStatus, EntryStatusCard, swissDetail } from './LeagueEventView'
import { LeagueReadiness } from './LeagueReadiness'
import { LeagueResults } from './LeagueResults'
import { LeagueRounds, ownTable, swissProgress } from './LeagueRounds'
import { eventName, leagueAllowances, leaguePhase, leaguePlayers } from './leagueEvent'
import { SAMPLE_STAGES, SAMPLE_VIEWER, sampleBattles, sampleStandings, sampleTournament, type SampleStage } from './sampleTournament'

const STAGES: Record<SampleStage, { label: string; explanation: string }> = {
  sealed: {
    label: 'Sealed lists',
    explanation:
      'Each player seals one of their saved rosters at the tournament’s points. Until the reveal nobody sees another player’s list, and that includes the organizer: Marcus can see who has sealed, never what. A player can swap their roster until then.',
  },
  reveal: {
    label: 'Reveal',
    explanation:
      'Once every roster is in, the organizer or any player opens them all at once. The lists are fixed from then on, and nobody new can join.',
  },
  rounds: {
    label: 'Rounds',
    explanation:
      'The organizer pairs each round. The first is drawn at random; after that, players meet others on the same score, never someone they have already played. With an odd number, one player has a bye, which counts as a win. Players start their table’s battle from the tournament page.',
  },
  results: {
    label: 'Standings',
    explanation:
      'Every finished battle feeds the standings: match points first, 3 for a win or bye and 1 for a draw, then victory points, then the match points of everyone a player has faced.',
  },
}

const label = (entry: LeagueEntryView) => entry.name
const nothing = () => undefined

/**
 * A made-up Swiss tournament at each stage, drawn with the real tournament page's parts and seen as one of its players,
 * so an organizer can see the whole event before running one. Nothing here is stored or sent.
 */
export function TournamentSample({ stage }: { stage: SampleStage }) {
  const { data: me } = useQuery(meQuery())
  const league = sampleTournament(stage)
  const battles = sampleBattles(stage)
  const revealed = Boolean(league.revealedAt)
  const accepted = league.entries
  const table = ownTable(league, SAMPLE_VIEWER)
  const progress = swissProgress(league, battles)
  const opponentId = table ? (table.aId === SAMPLE_VIEWER ? table.bId : table.aId) : null
  const status = entryStatus({
    league,
    ownEntry: accepted.find((entry) => entry.userId === SAMPLE_VIEWER),
    signedIn: true,
    isOrganizer: false,
    registrationFull: false,
    ownSideSealed: true,
    allies: [],
    playDetail: revealed
      ? swissDetail(table, false, false, progress, () => accepted.find((entry) => entry.userId === opponentId)?.name ?? '')
      : undefined,
    alone: true,
    join: nothing,
    joining: false,
    choose: nothing,
    play: nothing,
    sealingClosed: false,
    sealBy: null,
    playing: false,
  })
  const phase = leaguePhase(league, accepted.length, league.occupiedCount)
  const index = SAMPLE_STAGES.indexOf(stage)
  const next = SAMPLE_STAGES[index + 1]

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Sample tournament"
        title={league.tournament?.name}
        description="A made-up tournament, seen as one of its players. Nothing here is saved, and none of it counts anywhere."
        actions={
          me ? (
            <CreateLeague />
          ) : (
            <Link to="/sign-in" search={{ next: '/tournaments' }} className={buttonClass()}>
              Sign in to create a tournament
            </Link>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="chip text-info">Sample</span>
          <span className={`chip ${phase.tint}`}>{phase.label}</span>
          <span className="text-sm text-dim">
            {[
              leagueFormat(league),
              `Swiss, ${countLabel(league.rounds ?? 0, 'round')}`,
              leagueAllowances(league),
              leaguePlayers(league, accepted.length),
              `Organized by ${league.tournament?.ownerName}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <EventSchedule event={league} className="mt-3" />
      </PageHeader>

      <PageContent className="space-y-6">
        <nav aria-label="Sample tournament stages" className={pageLinkTabsClass}>
          {SAMPLE_STAGES.map((candidate, position) => (
            <Link
              key={candidate}
              to="/tournaments/sample"
              search={candidate === SAMPLE_STAGES[0] ? {} : { stage: candidate }}
              aria-current={candidate === stage ? 'step' : undefined}
              className={pageLinkTabClass(candidate === stage)}
            >
              {position + 1}. {STAGES[candidate].label}
            </Link>
          ))}
        </nav>
        <p className="flex max-w-2xl gap-3 border border-l-2 border-info/30 border-l-info bg-info/5 p-4 text-sm text-dim">
          <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
          <span>{STAGES[stage].explanation}</span>
        </p>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="lg:col-start-2 lg:row-start-1">
            <EntryStatusCard status={{ ...status, action: undefined, secondary: undefined }} problem={null} token={league.token} />
          </div>
          <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
            {revealed ? null : (
              <LeagueReadiness token={league.token} league={league} viewerId={SAMPLE_VIEWER} isOrganizer={false} label={label} />
            )}
            {/* Once rounds are paired they are the stage's subject, so they lead and the familiar rosters follow. */}
            {revealed ? (
              <LeagueRounds
                league={league}
                token={league.token}
                battles={battles}
                viewerId={SAMPLE_VIEWER}
                isOrganizer={false}
                entries={accepted}
                label={label}
                onPlay={nothing}
                playing={false}
                sample
              />
            ) : null}
            {league.pairings.length ? (
              <LeagueResults
                event={eventName(league)}
                rows={sampleStandings(stage)}
                swiss
                partial={false}
                entries={accepted}
                label={label}
                sample
              />
            ) : null}
            {revealed ? (
              <LeagueArmies
                token={league.token}
                eventToken={league.eventToken}
                groups={[{ key: 'all', entries: accepted }]}
                viewerId={SAMPLE_VIEWER}
                revealedBy={league.revealedByName}
                label={label}
                canUnseal={false}
                dropBy={null}
                onSimulate={null}
                sample
              />
            ) : (
              <section>
                <SectionHeading title="Entrants" count={accepted.length} />
                <EntrantList>
                  {accepted.map((entry) => (
                    <EntrantRow key={entry.userId} entry={entry} label={label(entry)} detail={sealStatus(entry, revealed)} sample />
                  ))}
                </EntrantList>
              </section>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-edge pt-4">
          {next ? (
            <Link to="/tournaments/sample" search={{ stage: next }} className={buttonClass({ variant: 'outline' })}>
              Next: {STAGES[next].label} <ChevronRight />
            </Link>
          ) : (
            <Link to="/tournaments/sample" className={buttonClass({ variant: 'outline' })}>
              <RotateCcw /> Back to the start
            </Link>
          )}
        </div>
      </PageContent>
    </main>
  )
}
