import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Info } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useEffect } from 'react'
import { leagueRegistrationFull, type LeagueEntryView } from '../../../core/league'
import { buttonClass } from '../../components/buttonClass'
import { PageContent, PageHeader } from '../../components/Page'
import { pageLinkTabClass, pageLinkTabsClass } from '../../components/PageTabs'
import { meQuery } from '../../queries'
import { CreateLeague } from './CreateLeague'
import { LeagueArmies } from './LeagueArmies'
import { EntrantList, EntrantRow, SectionHeading, sealStatus } from './LeagueEntrants'
import { duelPlayDetail, entryStatus, EntryStatusCard } from './LeagueEventView'
import { LeagueReadiness } from './LeagueReadiness'
import { LeagueResults } from './LeagueResults'
import { leagueFormat, leaguePhase, leaguePlayers } from './leagueEvent'
import { LEAGUE_SAMPLE_STAGES, LEAGUE_SAMPLE_VIEWER, sampleLeague, sampleLeagueResults, type LeagueSampleStage } from './sampleLeague'

const STAGES: Record<LeagueSampleStage, { label: string; explanation: string }> = {
  join: {
    label: 'Registration',
    explanation:
      'You create the league and send its link. Players join from its page, or you add friends yourself, and you can choose to approve each one.',
  },
  seal: {
    label: 'Sealed rosters',
    explanation:
      'Each player seals one of their saved rosters at the league’s points. Nobody sees another player’s list before the reveal, not even the organizer, and a player can swap theirs until then.',
  },
  reveal: {
    label: 'Reveal',
    explanation:
      'Once every roster is in, the organizer or any player opens them all at once. Rosters are fixed from then on, and players start their league battles from this page.',
  },
  play: {
    label: 'Results',
    explanation:
      'Every finished league battle adds to the results table: wins first, then draws, then victory points. Each player sees who they still have to play.',
  },
}

/**
 * A made-up league at each stage of its event, drawn with the real league page's parts, so an organizer can see the
 * whole journey before inviting anyone. Nothing here is stored, and there is nothing to press but the stages.
 */
export function LeagueSample({ stage }: { stage: LeagueSampleStage }) {
  const { data: me } = useQuery(meQuery())
  useEffect(() => {
    posthog.capture('league_sample_opened')
  }, [])
  const league = sampleLeague(stage)
  const results = sampleLeagueResults(stage)
  const accepted = league.entries.filter((entry) => entry.status === 'accepted')
  const ownEntry = league.entries.find((entry) => entry.userId === LEAGUE_SAMPLE_VIEWER)
  const label = (entry: LeagueEntryView) => entry.name
  const revealed = Boolean(league.revealedAt)
  const met = new Set(
    results.met.flatMap(([one, other]) => (one === LEAGUE_SAMPLE_VIEWER ? [other] : other === LEAGUE_SAMPLE_VIEWER ? [one] : [])),
  )
  const opponents = accepted.filter((entry) => entry.userId !== LEAGUE_SAMPLE_VIEWER)
  const nothing = () => undefined
  const status = entryStatus({
    league,
    ownEntry,
    signedIn: true,
    isOrganizer: false,
    registrationFull: leagueRegistrationFull(league, accepted.length, league.occupiedCount),
    ownSideSealed: true,
    allies: [],
    playDetail: revealed ? duelPlayDetail(opponents.length, opponents.filter((entry) => !met.has(entry.userId)).map(label)) : undefined,
    alone: false,
    latest: true,
    join: nothing,
    joining: false,
    choose: nothing,
    play: nothing,
    playing: false,
  })
  const phase = leaguePhase(league, accepted.length, league.occupiedCount)
  const next = LEAGUE_SAMPLE_STAGES[LEAGUE_SAMPLE_STAGES.indexOf(stage) + 1]

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Sample league"
        title={league.name}
        description="A walk through one league event with made-up players. Nothing here is saved, and none of it counts anywhere."
        actions={
          me ? (
            <CreateLeague source="sample" />
          ) : (
            <Link to="/sign-in" search={{ next: '/leagues' }} className={buttonClass()}>
              Sign in to create a league
            </Link>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="chip text-info">Sample</span>
          <span className={`chip ${phase.tint}`}>{phase.label}</span>
          <span className="text-sm text-dim">
            {[leagueFormat(league), leaguePlayers(league, accepted.length), `Organized by ${league.ownerName}`].filter(Boolean).join(' · ')}
          </span>
        </div>
      </PageHeader>

      <PageContent className="space-y-6">
        <nav aria-label="Sample league stages" className={pageLinkTabsClass}>
          {LEAGUE_SAMPLE_STAGES.map((candidate, index) => (
            <Link
              key={candidate}
              to="/leagues/sample"
              search={candidate === 'join' ? {} : { stage: candidate }}
              aria-current={candidate === stage ? 'step' : undefined}
              className={pageLinkTabClass(candidate === stage)}
            >
              {index + 1}. {STAGES[candidate].label}
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
            {/* The results lead their own stage, where the rosters above them are already familiar. */}
            {results.rows.some((row) => row.played) ? (
              <LeagueResults rows={results.rows} partial={false} entries={accepted} label={label} sample />
            ) : null}
            {revealed ? null : (
              <LeagueReadiness league={league} viewerId={ownEntry ? LEAGUE_SAMPLE_VIEWER : null} isOrganizer={false} label={label} />
            )}
            {revealed ? (
              <LeagueArmies
                token={league.token}
                eventToken={league.eventToken}
                groups={[{ key: 'all', entries: accepted }]}
                viewerId={LEAGUE_SAMPLE_VIEWER}
                revealedBy={league.revealedByName}
                label={label}
                canUnseal={false}
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

        {next ? (
          <div className="flex justify-end border-t border-edge pt-4">
            <Link to="/leagues/sample" search={{ stage: next }} className={buttonClass({ variant: 'outline' })}>
              Next: {STAGES[next].label} <ChevronRight />
            </Link>
          </div>
        ) : null}
      </PageContent>
    </main>
  )
}
