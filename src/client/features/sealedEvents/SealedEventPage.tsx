import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { PageContent, PageHeader } from '../../components/Page'
import { sealedEventQuery, meQuery } from '../../queries'
import { SealedEventPageActions, useSealedEventActions } from './SealedEventActions'
import { SealedEventView } from './SealedEventView'
import { EventSchedule } from './EventSchedule'
import { accessSummary, OrganizerLinks, VisibilityIcon } from './EventAccess'
import { eventName, sealedEventAllowances, sealedEventNoun, sealedEventPhase, sealedEventPlayers, type SealedEvent } from './sealedEvent'
import { countLabel } from '../../text'
import { sealedEventFormat } from '../../../core/sealedEvent'

export function SealedEventPage({ token, startBattle, chooseRoster }: { token: string; startBattle?: boolean; chooseRoster?: boolean }) {
  const navigate = useNavigate()
  const { data: me } = useQuery(meQuery())
  const { data: sealedEvent } = useQuery(sealedEventQuery(token))
  useEffect(() => {
    if (sealedEvent === null) void navigate({ to: '/tournaments' })
  }, [sealedEvent, navigate])
  if (!sealedEvent) return null
  return (
    <SealedEventScreen
      sealedEvent={sealedEvent}
      token={token}
      viewerId={me?.id ?? null}
      startBattle={startBattle}
      chooseRoster={chooseRoster}
    />
  )
}

function SealedEventScreen({
  sealedEvent,
  token,
  viewerId,
  startBattle,
  chooseRoster,
}: {
  sealedEvent: SealedEvent
  token: string
  viewerId: string | null
  startBattle?: boolean
  chooseRoster?: boolean
}) {
  const navigate = useNavigate()
  const { tournament } = sealedEvent
  const isOrganizer = sealedEvent.organizer
  // A tournament's owner alone deletes it; a group game goes with any of its group's organizers.
  const canDelete = tournament ? viewerId === tournament.ownerId : isOrganizer
  const actions = useSealedEventActions(sealedEvent, () =>
    sealedEvent.group ? navigate({ to: '/groups/$token', params: { token: sealedEvent.group.token } }) : navigate({ to: '/tournaments' }),
  )
  const accepted = sealedEvent.entries.filter((entry) => entry.status === 'accepted').length
  const phase = sealedEventPhase(sealedEvent, accepted, sealedEvent.occupiedCount)

  return (
    <main className="w-full">
      <PageHeader
        eyebrow={sealedEventNoun(sealedEvent).Noun}
        title={eventName(sealedEvent)}
        actions={isOrganizer ? <SealedEventPageActions actions={actions} canDelete={canDelete} /> : null}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`chip ${phase.tint}`}>{phase.label}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-dim">
            {[
              // A hidden-list game's title already says its format and points.
              sealedEvent.group ? null : sealedEventFormat(sealedEvent),
              sealedEvent.rounds ? `Swiss, ${countLabel(sealedEvent.rounds, 'round')}` : null,
              sealedEventAllowances(sealedEvent),
              sealedEventPlayers(sealedEvent, accepted),
            ]
              .filter(Boolean)
              .join(' · ')}
            {tournament ? (
              <>
                {' '}
                ·
                <VisibilityIcon visibility={tournament.visibility} />
                {accessSummary(tournament.visibility, tournament.admission)}
              </>
            ) : null}
          </span>
        </div>
        <EventSchedule event={sealedEvent} className="mt-3" />
        {sealedEvent.group ? (
          <p className="mt-3 flex flex-wrap gap-x-1.5 text-sm text-dim">
            <span>Part of</span>
            <Link to="/groups/$token" params={{ token: sealedEvent.group.token }} className="text-bone hover:underline">
              {sealedEvent.group.name}
            </Link>
          </p>
        ) : null}
        {tournament?.description ? (
          <p className="mt-3 max-w-2xl font-rules text-sm whitespace-pre-wrap text-dim">{tournament.description}</p>
        ) : null}
        {tournament ? (
          <OrganizerLinks
            title="Organized by"
            organizers={[{ id: tournament.ownerId, name: tournament.ownerName, image: tournament.ownerImage }, ...tournament.admins]}
          />
        ) : null}
      </PageHeader>

      <PageContent>
        <SealedEventView
          sealedEvent={sealedEvent}
          token={token}
          viewerId={viewerId}
          isOrganizer={isOrganizer}
          startBattle={startBattle}
          chooseRoster={chooseRoster}
        />
      </PageContent>
    </main>
  )
}
