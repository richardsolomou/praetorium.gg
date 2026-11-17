import { useMutation, useQuery } from '@tanstack/react-query'
import { FileLock2, Lock, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Switch } from '@/components/ui/switch'
import { pointsBudgetError, pointsLabel } from '../../../core/battle'
import { SEALED_EVENT_DEFAULT_ROSTER_LIMIT } from '../../../core/sealedEvent'
import { Problem } from '../../components/Problem'
import { drawGroupLeague, startSealedGroupLeague, type groupLeague } from '../../functions'
import { sealedEventQuery } from '../../queries'
import { useEntrantGroups } from '../sealedEvents/SealedEventEntrants'
import { RevealedLists } from '../sealedEvents/SealedEventArmies'
import { useSealList } from '../sealedEvents/SealList'
import { SealedEventRuleFields } from '../sealedEvents/SealedEventRuleFields'
import { useSealedEventRefresh } from '../sealedEvents/sealedEvent'
import { memberNameOf, useGroupRefresh, type Group } from './group'
import { SealingPlayer } from './SealingPlayer'

type League = NonNullable<Awaited<ReturnType<typeof groupLeague>>>
type LeagueGame = NonNullable<League['game']>
type LeagueRule = Parameters<typeof SealedEventRuleFields>[0]['value']

/** What every list in a league must be built to. */
export const leaguePoints = (game: LeagueGame) => pointsLabel(game.pointsBudget ?? game.rosterLimit ?? SEALED_EVENT_DEFAULT_ROSTER_LIMIT)

/** An organizer's start of a league, which can have every player seal a list before the draw is published. */
export function StartLeagueDialog({ group, open, onClose }: { group: Group; open: boolean; onClose: () => void }) {
  const refresh = useGroupRefresh(group.token)
  const [sealed, setSealed] = useState(false)
  const [rule, setRule] = useState<LeagueRule>({
    format: '1v1',
    rosterLimit: SEALED_EVENT_DEFAULT_ROSTER_LIMIT,
    allowances: [],
    rounds: null,
    pointsBudget: null,
    soloPoints: null,
    allyPoints: null,
    sharedPoints: false,
  })
  const start = useMutation({
    mutationFn: () =>
      sealed
        ? startSealedGroupLeague({
            data: { token: group.token, rosterLimit: rule.rosterLimit, pointsBudget: rule.pointsBudget, allowances: rule.allowances },
          })
        : drawGroupLeague({ data: { token: group.token } }),
    onSuccess: onClose,
    onSettled: refresh,
  })
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !start.isPending && onClose()}>
      <DialogContent showCloseButton={!start.isPending} size="md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Start a league</DialogTitle>
          <DialogDescription>
            A round robin: every member who joins plays every other member once. You review the draw before you publish it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            start.mutate()
          }}
        >
          <DialogBody>
            <div className="space-y-1.5">
              <label htmlFor="league-sealed" className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Seal lists before it starts</span>
                <Switch id="league-sealed" checked={sealed} disabled={start.isPending} onCheckedChange={setSealed} />
              </label>
              <p className="text-sm text-dim">
                {sealed
                  ? 'Each player seals one list in secret to join. Publishing reveals them all, and every game is played with them.'
                  : 'Each of you picks a list when a game starts.'}
              </p>
            </div>
            {sealed ? (
              <SealedEventRuleFields
                value={rule}
                pairing={false}
                duel
                shapeLock={null}
                disabled={start.isPending}
                onChange={(next) => setRule({ ...next, format: '1v1' })}
              />
            ) : null}
            {start.error ? <Problem error={start.error} /> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={start.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={start.isPending || (sealed && Boolean(pointsBudgetError(rule.rosterLimit, rule.pointsBudget)))}>
              <Trophy /> {start.isPending ? 'Starting…' : 'Start league'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A member's way into a draft league that seals lists: sealing one is joining, and sealing again replaces it. */
export function SealLeagueList({ group, game, sealed, primary }: { group: Group; game: LeagueGame; sealed: boolean; primary: boolean }) {
  const refreshGame = useSealedEventRefresh(game.token)
  const refreshGroup = useGroupRefresh(group.token)
  // Every league game is one on one, so each list plays alone and seals its Force Disposition.
  const seal = useSealList({
    token: game.token,
    playsAlone: true,
    requiredLimit: game.rosterLimit,
    pointsBudget: game.pointsBudget,
    onSealed: () => Promise.all([refreshGame(), refreshGroup()]),
  })
  return (
    <>
      <Button variant={sealed || !primary ? 'outline' : 'default'} onClick={seal.open}>
        {sealed ? (
          <>
            <Lock /> Swap your list
          </>
        ) : (
          <>
            <FileLock2 /> Seal a list to join
          </>
        )}
      </Button>
      {seal.element}
    </>
  )
}

/** Who has sealed a list for a draft league, with the viewer's own by name. */
export function LeagueSealing({
  group,
  league,
  game,
  viewerId,
}: {
  group: Group
  league: League
  game: LeagueGame
  viewerId: string | null
}) {
  const { data: record } = useQuery(sealedEventQuery(game.token))
  const ownList = record?.entries.find((entry) => entry.userId === viewerId)?.rosterName ?? null
  return (
    <ul aria-label="Sealed lists" className="mt-3 divide-y divide-edge overflow-hidden part">
      {league.players.map((player) => (
        <SealingPlayer
          key={player.userId}
          group={group}
          userId={player.userId}
          viewerId={viewerId}
          sealed={game.sealedIds.includes(player.userId)}
          list={player.userId === viewerId ? ownList : null}
        />
      ))}
    </ul>
  )
}

/** Every player's list, revealed when the league was published. */
export function LeagueLists({ group, game, viewerId }: { group: Group; game: LeagueGame; viewerId: string | null }) {
  const { data: record } = useQuery(sealedEventQuery(game.token))
  const nameOf = memberNameOf(group)
  const entries = record?.entries.filter((entry) => game.sealedIds.includes(entry.userId)) ?? []
  const groups = useEntrantGroups(record ?? undefined, entries, (entry) => nameOf(entry.userId))
  if (!record) return null
  return (
    <RevealedLists
      token={game.token}
      eventToken={game.token}
      groups={groups}
      viewerId={viewerId}
      label={(entry) => nameOf(entry.userId)}
      onSimulate={null}
    />
  )
}
