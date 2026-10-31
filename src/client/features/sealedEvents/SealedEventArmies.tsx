import { useMutation, useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import type { ReactNode } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { version } from '../../../../package.json'
import type { SealedEventArmy, SealedEventEntryView } from '../../../core/sealedEvent'
import { sealedEventRosterBundle, type BundledRoster } from '../../../core/sealedEventRosterBundle'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { Problem } from '../../components/Problem'
import { safeFileName } from '../../downloadFile'
import { factionFor } from '../../factions'
import { openRevealedSealedEventRosters } from '../../functions'
import { factionIndexQuery, gameReferencesQuery } from '../../queries'
import { revealedSealedEventRostersKey } from '../../queries/queryKeys'
import { useExportText } from '../../useCopyText'
import { dispositionIn } from '../battle/setup/chrome'
import { SimulateButton, ViewRosterButton } from './SealedEventEntrants'
import { DropEntrant } from './SealedEventDrop'
import { UnsealRoster } from './SealedEventUnseal'

/** One titled side or team of rosters, or a duel's single untitled run. */
export type ArmyGroup = { key: string; title?: string; detail?: string; entries: RevealedEntry[] }

export type RevealedEntry = SealedEventEntryView & {
  army: SealedEventArmy | null
  armyFaction: FactionPresentation | null
  sealedAt: number | null
}

/**
 * Every revealed roster as a row: whose it is and what army it fields, with the full roster a tap away.
 *
 * This is what a reveal is for, so it leads the page once the rosters are out. `groups` splits the
 * rosters by 2v1 side or doubles team as the entrant list does, and one untitled group holds a duel's;
 * `onSimulate` is offered only to a reader with a sealed roster of their own to set against another.
 */
export function SealedEventArmies({
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
  label: (entry: SealedEventEntryView) => string
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
  const openRosters = () => openRevealedSealedEventRosters({ data: { token, eventToken } })
  // The app copies rather than downloads, and iOS refuses a clipboard write that waits on the network after the tap.
  const preloaded = useQuery({
    queryKey: revealedSealedEventRostersKey(token, eventToken),
    queryFn: openRosters,
    enabled: native && !sample,
  })
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
      const text = sealedEventRosterBundle({
        event,
        capturedAt: new Date(),
        rosters,
        dispositionName: (id) => dispositionIn(references, id)?.name,
        version,
      })
      posthog.capture('sealed_event_rosters_exported', { rosters: sealed.size })
      await exportText(text, {
        name: `${safeFileName(event, 'event')}-rosters.txt`,
        type: 'text/plain;charset=utf-8',
        operation: 'sealed_event_rosters_export_copy',
      })
    },
  })
  return (
    <section data-sealed-event-armies aria-labelledby="sealed-event-armies">
      <div className="mb-2 flex min-h-8 flex-wrap items-end justify-between gap-x-3 gap-y-1 border-b border-edge pb-2">
        <h2 id="sealed-event-armies" className="rubric shrink-0">
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
      <RevealedLists
        token={token}
        eventToken={eventToken}
        groups={groups}
        viewerId={viewerId}
        label={label}
        onSimulate={onSimulate}
        canUnseal={canUnseal}
        dropBy={dropBy}
        sample={sample}
      />
    </section>
  )
}

/**
 * Revealed lists as compact rows, split into side-by-side columns by 2v1 side or doubles team. A titled side is simulated
 * as a whole from its heading; a duel's untitled run leaves simulating to each row. `bare` drops the outer frame for a
 * list that sits inside a card, and `actions` adds anything a row offers first, such as playing that opponent.
 */
export function RevealedLists({
  token,
  eventToken,
  groups,
  viewerId,
  label,
  onSimulate,
  canUnseal = false,
  dropBy = null,
  sample = false,
  bare = false,
  actions,
}: {
  token: string
  eventToken: string
  groups: readonly ArmyGroup[]
  viewerId: string | null
  label: (entry: SealedEventEntryView) => string
  onSimulate: ((userId: string) => void) | null
  /** The organizer's: sends a revealed roster back to its player to seal a replacement. */
  canUnseal?: boolean
  /** In Swiss rounds, who the viewer may take out of later rounds: anyone as an organizer, or only themselves. */
  dropBy?: 'organizer' | 'player' | null
  sample?: boolean
  bare?: boolean
  actions?: (entry: RevealedEntry) => ReactNode
}) {
  const { data: factions } = useQuery(factionIndexQuery())
  const row = (entry: RevealedEntry, alone: boolean) => {
    const army = entry.army
    const named = label(entry)
    // The server names a sealed army even when today's catalogue index no longer lists its catalogue.
    const faction = entry.armyFaction ?? (army?.catalogueId ? factionFor(factions, army.catalogueId) : undefined)
    const droppable = !sample && !entry.dropped && (dropBy === 'organizer' || (dropBy === 'player' && entry.userId === viewerId))
    return (
      <li key={entry.userId} data-army={entry.name} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2">
        <PlayerAvatar name={entry.name} image={entry.image} className="size-8 text-2xs" />
        <span className="min-w-0 flex-1 basis-24">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-sm leading-tight font-bold uppercase">{named}</span>
            {entry.userId === viewerId ? <span className="eyebrow shrink-0 text-parchment">You</span> : null}
            {entry.dropped ? <span className="chip shrink-0 text-dim">Dropped</span> : null}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-dim">
            {army ? (
              <>
                {/* The mark stands in for the faction's name, so the line keeps room for the list and its points. */}
                {faction ? (
                  <span title={faction.displayName} className="inline-flex shrink-0">
                    <FactionMark faction={faction} size="sm" />
                    <span className="sr-only">{faction.displayName}</span>
                  </span>
                ) : null}
                <span className="min-w-0 break-words">
                  <span className="uppercase">{army.name}</span>
                  {army.limit == null ? null : ` · ${army.points}/${army.limit}`}
                </span>
              </>
            ) : entry.submitted ? (
              'This roster can’t be shown.'
            ) : (
              'No roster yet. The organizer unsealed it for a replacement.'
            )}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
          {actions?.(entry)}
          {droppable ? (
            <DropEntrant token={token} eventToken={eventToken} userId={entry.userId} label={named} self={entry.userId === viewerId} />
          ) : null}
          {army && canUnseal ? <UnsealRoster token={token} eventToken={eventToken} userId={entry.userId} label={named} /> : null}
          {army && onSimulate && alone && entry.userId !== viewerId ? (
            <SimulateButton label={named} onClick={() => onSimulate(entry.userId)} />
          ) : null}
          {army && !sample ? <ViewRosterButton token={token} eventToken={eventToken} userId={entry.userId} label={named} /> : null}
        </span>
      </li>
    )
  }
  return (
    <div
      className={`grid grid-cols-1 gap-px bg-edge ${groups.length > 1 ? 'sm:grid-cols-2' : ''} ${bare ? 'border-t border-edge' : 'border border-edge'}`}
    >
      {groups.map((group) => {
        const opponent = group.entries.find((entry) => entry.army)
        return (
          <section key={group.key} data-group={group.key} aria-label={group.title} className="min-w-0 bg-panel">
            {group.title ? (
              <div className="flex min-h-8 items-center gap-2 pt-2 pr-2 pl-4">
                <div className="min-w-0 flex-1">
                  <h3 className="eyebrow text-dim">{group.title}</h3>
                  {group.detail ? <p className="text-xs text-faint">{group.detail}</p> : null}
                </div>
                {onSimulate && opponent && !group.entries.some((entry) => entry.userId === viewerId) ? (
                  <SimulateButton label={group.title} onClick={() => onSimulate(opponent.userId)} />
                ) : null}
              </div>
            ) : null}
            <ul className="divide-y divide-edge">{group.entries.map((entry) => row(entry, !group.title))}</ul>
          </section>
        )
      })}
    </div>
  )
}
