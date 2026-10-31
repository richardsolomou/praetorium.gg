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
import { SEALED_EVENT_CARD, SealedEventCardActions } from './SealedEventActions'
import { sealedEventPhase, sealedEventPlayers } from './sealedEvent'
import { sealedEventFormat } from '../../../core/sealedEvent'

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
        eyebrow="Events"
        title="Tournaments"
        description="One-off tournaments where everyone seals a list in secret, then the lists are revealed together."
        actions={
          <>
            {me ? <GuideHelp task="tournament">Tournament guide</GuideHelp> : null}
            <SampleLink />
            {me ? <CreateSealedEvent /> : null}
          </>
        }
      />
      <PageContent className="space-y-6">
        {mine.length ? <SealedEventShelf title="Your tournaments" sealedEvents={mine} viewerId={me?.id ?? null} /> : null}
        {publicSealedEvents.length ? (
          <SealedEventShelf title="Public tournaments" sealedEvents={publicSealedEvents} viewerId={me?.id ?? null} />
        ) : null}
        {!sealedEvents.length ? (
          <PageState
            headingLevel={2}
            eyebrow="Sealed rosters"
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
      <div className="grid gap-3 md:grid-cols-2">
        {sealedEvents.map((sealedEvent) => {
          const { tournament } = sealedEvent
          const organizer = isSealedEventOrganizer(tournament, tournament.adminIds, viewerId)
          // One status: the reader's own place when they have one, otherwise where the tournament stands.
          const status = sealedEvent.ownEntry
            ? ownEntryStatus(sealedEvent.ownEntry, Boolean(sealedEvent.revealedAt))
            : sealedEventPhase(sealedEvent, sealedEvent.entrantCount, sealedEvent.occupiedCount)
          const format = sealedEventFormat(sealedEvent)
          const card = (
            <Link to="/tournaments/$token" params={{ token: sealedEvent.token }} className="flex min-w-0 flex-1 flex-col">
              <div className={`flex-1 p-4 ${organizer ? 'pr-12' : ''}`}>
                <p className="flex items-center gap-2 text-xs text-dim">
                  <VisibilityIcon visibility={tournament.visibility} labelled />
                  <span className="truncate tracking-label uppercase">{format ?? 'Any format'}</span>
                </p>
                <h3 className="mt-1.5 truncate text-lg leading-tight font-bold uppercase">{tournament.name}</h3>
                <EventSchedule event={sealedEvent} className="mt-1 text-xs" />
                {tournament.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-dim">{tournament.description}</p>
                ) : (
                  <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm text-dim">
                    <PlayerAvatar name={tournament.ownerName} image={tournament.ownerImage} className="size-5 text-3xs" />
                    <span className="truncate">Organized by {tournament.ownerName}</span>
                  </p>
                )}
              </div>
              <div className="flex min-w-0 items-center gap-3 border-t border-edge bg-sunken/60 px-4 py-2.5 text-sm">
                <span className={`flex min-w-0 items-center gap-2 font-semibold ${status.tint}`}>
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
                  <span className="truncate">{status.label}</span>
                </span>
                <span className="ml-auto shrink-0 text-xs text-dim">{sealedEventPlayers(sealedEvent, sealedEvent.entrantCount)}</span>
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
                  <div className="absolute top-2 right-2">{menu}</div>
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

/** Where the reader's own entry stands, tinted by whether it needs them: amber to act, green once done. */
function ownEntryStatus(entry: { status: 'pending' | 'accepted' | 'rejected'; submitted: boolean }, revealed: boolean) {
  if (entry.status === 'pending') return { label: 'Waiting for approval', tint: 'text-dim' }
  if (entry.status === 'rejected') return { label: 'Not in this tournament', tint: 'text-faint' }
  if (entry.submitted)
    return revealed ? { label: 'Rosters revealed', tint: 'text-achieved' } : { label: 'Your roster is sealed', tint: 'text-achieved' }
  return revealed ? { label: 'No roster', tint: 'text-faint' } : { label: 'Seal your roster', tint: 'text-discarded' }
}
