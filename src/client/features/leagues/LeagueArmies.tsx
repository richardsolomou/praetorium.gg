import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Calculator, Download } from 'lucide-react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { version } from '../../../../package.json'
import type { LeagueArmy, LeagueEntryView } from '../../../core/league'
import { leagueRosterBundle, type BundledRoster } from '../../../core/leagueRosterBundle'
import type { FactionPresentation } from '../../components/FactionMark'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { Problem } from '../../components/Problem'
import { safeFileName } from '../../downloadFile'
import { factionFor } from '../../factions'
import { openRevealedLeagueRosters } from '../../functions'
import { factionIndexQuery, gameReferencesQuery } from '../../queries'
import { revealedLeagueRostersKey } from '../../queries/queryKeys'
import { useExportText } from '../../useCopyText'
import { RosterSummary } from '../rosters/RosterSummary'
import { EntrantGroup, IconAction, ViewRosterButton } from './LeagueEntrants'
import { DropEntrant } from './LeagueDrop'
import { UnsealRoster } from './LeagueUnseal'

/** One titled side or team of rosters, or a duel's single untitled run. */
type ArmyGroup = { key: string; title?: string; detail?: string; entries: RevealedEntry[] }

type RevealedEntry = LeagueEntryView & {
  army: LeagueArmy | null
  armyFaction: FactionPresentation | null
  sealedAt: number | null
}

/**
 * Every revealed roster as a card: whose it is, what army it fields, and what it leans on.
 *
 * This is what a reveal is for, so it leads the page once the rosters are out. `groups` splits the
 * rosters by 2v1 side or doubles team as the entrant list does, and one untitled group holds a duel's;
 * `onSimulate` is offered only to a reader with a sealed roster of their own to set against another.
 */
export function LeagueArmies({
  token,
  eventToken,
  event,
  groups,
  viewerId,
  revealedBy,
  label,
  canUnseal,
  dropBy,
  onSimulate,
  sample = false,
}: {
  token: string
  eventToken: string
  /** The event's name, which heads an exported file. */
  event: string
  groups: readonly ArmyGroup[]
  viewerId: string | null
  revealedBy: string | null
  label: (entry: LeagueEntryView) => string
  /** The organizer's: sends a revealed roster back to its player to seal a replacement. */
  canUnseal: boolean
  /** In Swiss rounds, who the viewer may take out of later rounds: anyone as an organizer, or only themselves. */
  dropBy: 'organizer' | 'player' | null
  onSimulate: ((userId: string) => void) | null
  /** The sample tournament's made-up rosters, which have no player or saved roster to open. */
  sample?: boolean
}) {
  const { data: factions } = useQuery(factionIndexQuery())
  const { data: references } = useQuery(gameReferencesQuery())
  const { exportText, native, copied, problem } = useExportText()
  const entries = groups.flatMap((group) => group.entries)
  const openRosters = () => openRevealedLeagueRosters({ data: { token, eventToken } })
  // The app copies rather than downloads, and iOS refuses a clipboard write that waits on the network after the tap.
  const preloaded = useQuery({ queryKey: revealedLeagueRostersKey(token, eventToken), queryFn: openRosters, enabled: native && !sample })
  const exported = useMutation({
    mutationFn: async () => {
      const sealed = new Map((preloaded.data ?? (await openRosters())).map((entry) => [entry.userId, entry.roster]))
      const rosters = entries.map((entry): BundledRoster => {
        const player = label(entry)
        const roster = sealed.get(entry.userId)
        if (roster === undefined) return { player, absent: 'No roster yet. The organizer unsealed it for a replacement.' }
        if (roster === null) return { player, absent: 'This roster can’t be shown.' }
        const catalogueId = roster.built?.catalogueId ?? ''
        const faction = entry.armyFaction?.displayName ?? factionFor(factions, catalogueId)?.displayName ?? catalogueId
        return { player, roster, faction }
      })
      const text = leagueRosterBundle({
        event,
        capturedAt: new Date(),
        rosters,
        dispositionName: (id) => references?.dispositions.find((disposition) => disposition.id === id)?.name ?? id,
        version,
      })
      posthog.capture('league_rosters_exported', { rosters: sealed.size })
      await exportText(text, {
        name: `${safeFileName(event, 'event')}-rosters.txt`,
        type: 'text/plain;charset=utf-8',
        operation: 'league_rosters_export_copy',
      })
    },
  })
  return (
    <section data-league-armies aria-labelledby="league-armies">
      <div className="mb-2 flex min-h-8 flex-wrap items-end justify-between gap-x-3 gap-y-1 border-b border-edge pb-2">
        <h2 id="league-armies" className="rubric shrink-0">
          The rosters
        </h2>
        <div className="ml-auto flex items-center gap-3">
          {revealedBy ? <p className="text-xs text-dim">Revealed by {revealedBy}</p> : null}
          {sample ? null : (
            <Button
              variant="outline"
              size="sm"
              disabled={exported.isPending || (native && !preloaded.data)}
              onClick={() => exported.mutate()}
            >
              <Download /> {native ? (copied ? 'Copied rosters' : 'Copy rosters') : 'Export rosters'}
            </Button>
          )}
        </div>
      </div>
      {exported.error ? <Problem className="mb-2" error={exported.error} /> : null}
      {problem ? <Problem className="mb-2">{problem}</Problem> : null}
      <div className="space-y-4">
        {groups.map((group) => {
          const cards = <div className="space-y-2">{group.entries.map(card)}</div>
          return group.title ? (
            <EntrantGroup key={group.key} group={group.key} title={group.title} detail={group.detail}>
              {cards}
            </EntrantGroup>
          ) : (
            <div key={group.key}>{cards}</div>
          )
        })}
      </div>
    </section>
  )

  function card(entry: RevealedEntry) {
    const army = entry.army
    // The server names a sealed army even when today's catalogue index no longer lists its catalogue.
    const presentation = entry.armyFaction ?? (army?.catalogueId ? factionFor(factions, army.catalogueId) : undefined)
    const faction =
      presentation && army
        ? { slug: presentation.slug, displayName: presentation.displayName, icon: presentation.icon, detachments: army.detachments }
        : undefined
    const named = label(entry)
    const player = (
      <>
        <PlayerAvatar name={entry.name} image={entry.image} className="size-6 text-3xs" />
        <span className="truncate text-sm font-bold uppercase group-hover:text-info group-hover:underline">{named}</span>
      </>
    )
    const summary =
      army?.limit != null ? (
        <RosterSummary
          roster={{
            name: army.name,
            detachmentIds: army.detachments.map((detachment) => detachment.id),
            disposition: army.disposition,
            limit: army.limit,
            pointsBudget: army.pointsBudget,
            unitCount: army.unitCount,
            updatedAt: entry.sealedAt ?? 0,
            waivedRules: army.waivedRules,
          }}
          faction={faction}
          points={army.points}
          dispositionName={references?.dispositions.find((disposition) => disposition.id === army.disposition)?.name}
          showLock={false}
          dateLabel="sealed"
        />
      ) : null
    const droppable = !sample && !entry.dropped && (dropBy === 'organizer' || (dropBy === 'player' && entry.userId === viewerId))
    return (
      <article key={entry.userId} data-army={entry.name} className="min-w-0 border border-edge bg-panel">
        <div className="flex min-w-0 items-center gap-2 border-b border-edge py-1.5 pr-1.5 pl-3">
          {sample ? (
            <div className="flex min-w-0 items-center gap-2">{player}</div>
          ) : (
            <Link to="/users/$userId" params={{ userId: entry.userId }} className="group flex min-w-0 items-center gap-2">
              {player}
            </Link>
          )}
          {entry.dropped ? <span className="chip shrink-0 text-dim">Dropped</span> : null}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {droppable ? (
              <DropEntrant token={token} eventToken={eventToken} userId={entry.userId} label={named} self={entry.userId === viewerId} />
            ) : null}
            {army && canUnseal ? <UnsealRoster token={token} eventToken={eventToken} userId={entry.userId} label={named} /> : null}
            {army && onSimulate && entry.userId !== viewerId ? (
              <IconAction
                tooltip="Simulate"
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={ICON_ACTION}
                    aria-label={`Simulate against ${named}`}
                    onClick={() => onSimulate(entry.userId)}
                  />
                }
              >
                <Calculator aria-hidden />
              </IconAction>
            ) : null}
            {army && !sample ? <ViewRosterButton token={token} eventToken={eventToken} userId={entry.userId} label={named} /> : null}
          </span>
        </div>
        {summary && sample ? (
          <div className="flex min-w-0 p-3">{summary}</div>
        ) : summary ? (
          <Link
            to="/rosters/$id"
            params={{ id: entry.userId }}
            search={{ league: token, event: eventToken }}
            tabIndex={-1}
            aria-hidden
            className="flex min-w-0 p-3"
          >
            {summary}
          </Link>
        ) : army ? (
          <p className="p-3 font-bold uppercase">{army.name}</p>
        ) : (
          <p className="p-3 text-sm text-dim">
            {entry.submitted ? 'This roster can’t be shown.' : 'No roster yet. The organizer unsealed it for a replacement.'}
          </p>
        )}
      </article>
    )
  }
}

const ICON_ACTION = 'text-dim hover:text-info pointer-coarse:size-11'
