import { VisibilityIcon } from './EventAccess'
import { SectionHeading } from '../../components/SectionHeading'
import { GuideHelp } from '../onboarding/GuideHelp'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { BookOpen, Users } from 'lucide-react'
import { buttonClass } from '../../components/buttonClass'
import { isSealedEventOrganizer } from '../../../core/sealedEvent'
import { sealedEventsQuery, meQuery, type QueryData } from '../../queries'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { CreateSealedEvent } from './CreateSealedEvent'
import { EventSchedule } from './EventSchedule'
import { SEALED_EVENT_CARD, SEALED_EVENT_ROWS, SealedEventCardActions } from './SealedEventActions'
import { ownEntryStatus, sealedEventPhase, sealedEventPlayers } from './sealedEvent'
import { sealedEventFormat } from '../../../core/sealedEvent'
import { nameColour } from '../../playerName'

export function SealedEventIndex() {
  const { data: me } = useQuery(meQuery())
  const { data: all = [] } = useQuery(sealedEventsQuery())
  // A group's hidden-list games are reached from its group page; the list keeps them for rosters due and offline saves.
  const sealedEvents = all.flatMap(({ tournament, ...sealedEvent }) => (tournament ? [{ ...sealedEvent, tournament }] : []))
  const mine = sealedEvents.filter((sealedEvent) => sealedEvent.personal)
  const publicSealedEvents = sealedEvents.filter(
    (sealedEvent) => sealedEvent.tournament.visibility === 'public' && !mine.includes(sealedEvent),
  )

  return (
    <main className="w-full">
      <PageHeader
        title="Tournaments"
        description="One-off tournaments where everyone seals a list in secret, then the lists are revealed together."
        actions={
          <>
            <SampleLink />
            {me ? <CreateSealedEvent /> : null}
          </>
        }
        help={me ? <GuideHelp task="tournament">Tournament guide</GuideHelp> : null}
      />
      <PageContent className="space-y-6">
        {mine.length ? <SealedEventShelf title="Your tournaments" sealedEvents={mine} viewerId={me?.id ?? null} /> : null}
        {publicSealedEvents.length ? (
          <SealedEventShelf title="Public tournaments" sealedEvents={publicSealedEvents} viewerId={me?.id ?? null} />
        ) : null}
        {!sealedEvents.length ? (
          <PageState
            headingLevel={2}
            title="No tournaments yet"
            explanation={me ? 'Create one and send the link to your group.' : 'Public tournaments will appear here. Sign in to create one.'}
            icon={Users}
            action={<SampleLink />}
          />
        ) : null}
      </PageContent>
    </main>
  )
}

function SampleLink() {
  return (
    <Link to="/tournaments/sample" className={buttonClass({ variant: 'outline' })}>
      <BookOpen /> See a sample
    </Link>
  )
}

function SealedEventShelf({
  title,
  sealedEvents,
  viewerId,
}: {
  title: string
  sealedEvents: (TournamentSummary & { tournament: NonNullable<TournamentSummary['tournament']> })[]
  viewerId: string | null
}) {
  return (
    <section>
      <SectionHeading title={title} count={sealedEvents.length} />
      <div className={SEALED_EVENT_ROWS}>
        {sealedEvents.map((sealedEvent) => {
          const { tournament } = sealedEvent
          const organizer = isSealedEventOrganizer(tournament, tournament.adminIds, viewerId)
          // One status: the reader's own place when they have one, otherwise where the tournament stands.
          const status = sealedEvent.ownEntry
            ? ownEntryStatus(sealedEvent.ownEntry, Boolean(sealedEvent.revealedAt))
            : sealedEventPhase(sealedEvent, sealedEvent.entrantCount, sealedEvent.occupiedCount)
          const format = sealedEventFormat(sealedEvent)
          const card = (
            <Link
              to="/tournaments/$token"
              params={{ token: sealedEvent.token }}
              className={`group flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-1.5 py-3 pl-2 ${organizer ? 'pr-12' : 'pr-2'}`}
            >
              <div className="min-w-0 flex-[1_1_18rem]">
                <h3 className="truncate text-lg leading-tight group-hover:underline">{tournament.name}</h3>
                <p className="mt-1 flex items-center gap-2 text-2xs text-dim">
                  <VisibilityIcon visibility={tournament.visibility} labelled />
                  <span className="truncate">{format ?? 'Any format'}</span>
                </p>
                <EventSchedule event={sealedEvent} className="mt-0.5 text-2xs" />
                {tournament.description ? (
                  <p className="mt-1 line-clamp-1 text-sm text-dim">{tournament.description}</p>
                ) : (
                  <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-dim">
                    <PlayerAvatar name={tournament.ownerName} image={tournament.ownerImage} className="size-5 text-3xs" />
                    <span className="truncate">
                      Organized by{' '}
                      <span style={nameColour({ id: tournament.ownerId, colour: tournament.ownerColour })}>{tournament.ownerName}</span>
                    </span>
                  </p>
                )}
              </div>
              <div className="flex min-w-0 shrink-0 items-center gap-3 text-sm sm:flex-col sm:items-end sm:gap-0.5 sm:text-right">
                <span className={`flex min-w-0 items-center gap-2 font-medium ${status.tint}`}>
                  <span aria-hidden className="h-0.5 w-4 shrink-0 rounded-full bg-current" />
                  <span className="truncate">{status.label}</span>
                </span>
                <span className="shrink-0 text-2xs text-faint max-sm:ml-auto">
                  {sealedEventPlayers(sealedEvent, sealedEvent.entrantCount)}
                </span>
              </div>
            </Link>
          )
          if (!organizer) {
            return (
              <article key={sealedEvent.token} data-sealed-event={sealedEvent.token} className={SEALED_EVENT_CARD}>
                {card}
              </article>
            )
          }
          return (
            <SealedEventCardActions key={sealedEvent.token} sealedEvent={sealedEvent} canDelete={tournament.ownerId === viewerId}>
              {(menu) => (
                <>
                  {card}
                  <div className="absolute top-3 right-1">{menu}</div>
                </>
              )}
            </SealedEventCardActions>
          )
        })}
      </div>
    </section>
  )
}

type TournamentSummary = QueryData<typeof sealedEventsQuery>[number]
