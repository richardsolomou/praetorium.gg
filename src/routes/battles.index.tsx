import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { EllipsisVertical, Eye, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { GAME_SIZES } from '../core/battle'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SignInRequired } from '../client/components/SignInRequired'
import { battlesQuery, gameReferencesQuery, meQuery, opponentsQuery } from '../client/queries'
import { useLiveBattles } from '../client/useLiveBattle'
import { errorMessage } from '../client/queryClient'
import { createBattle, deleteBattle } from '../server/functions'

type Battle = Awaited<ReturnType<NonNullable<ReturnType<typeof battlesQuery>['queryFn']>>>[number]

/** The three shapes a battle can take. A 2v1 splits the points across the allied pair. */
const FORMATS = [
  { key: 'duel', name: '1v1', detail: 'One army each' },
  { key: 'team', name: '2v1', detail: 'Two allies share a side' },
  { key: 'solo', name: 'Solo', detail: 'Practice on your own' },
] as const

export const Route = createFileRoute('/battles/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(meQuery()),
      context.queryClient.ensureQueryData(battlesQuery()),
      context.queryClient.ensureQueryData(opponentsQuery()),
      context.queryClient.ensureQueryData(gameReferencesQuery()),
    ]),
  component: Battles,
})

function Battles() {
  const { data: me } = useQuery(meQuery())
  const { data: battles = [] } = useQuery(battlesQuery())
  const [deleting, setDeleting] = useState<Battle | null>(null)
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: (token: string) => deleteBattle({ data: { token } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey }),
  })
  // Being added to a battle happens on someone else's device, so this page is told.
  useLiveBattles(Boolean(me))
  if (!me) return <SignInRequired title="Your battles" explanation="Sign in to see the battles you have played and the ones still going." />

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex items-end justify-between gap-4 border-b border-edge pb-4">
        <div>
          <p className="eyebrow">Your battles</p>
          <h1 className="text-2xl">My battles</h1>
        </div>
        <CreateBattle />
      </div>
      {battles.length ? (
        <div className="mt-5 space-y-6">
          <BattleShelf
            title="Active"
            battles={battles.filter((battle) => battle.status === 'playing')}
            viewerId={me.id}
            onDelete={setDeleting}
          />
          <BattleShelf
            title="Setup"
            battles={battles.filter((battle) => battle.status === 'setup')}
            viewerId={me.id}
            onDelete={setDeleting}
          />
          <BattleShelf
            title="Finished"
            battles={battles.filter((battle) => battle.status === 'finished')}
            viewerId={me.id}
            onDelete={setDeleting}
          />
        </div>
      ) : (
        <p className="mt-4 border border-edge bg-panel p-6 text-sm text-dim">No battles yet.</p>
      )}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className="rounded-none border border-edge bg-panel text-bone ring-0">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase">Delete battle?</AlertDialogTitle>
            <AlertDialogDescription className="text-dim">
              The battle and its full command history will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="rounded-none border-edge bg-sunken">
            <AlertDialogCancel>Keep battle</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (deleting) remove.mutate(deleting.token)
                setDeleting(null)
              }}
            >
              Delete battle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function CreateBattle() {
  const { data: opponents = [] } = useQuery(opponentsQuery())
  const { data: references } = useQuery(gameReferencesQuery())
  const [open, setOpen] = useState(false)
  const [opponentIds, setOpponentIds] = useState<string[]>([])
  const [teamBattle, setTeamBattle] = useState(false)
  const [solo, setSolo] = useState(false)
  const [limit, setLimit] = useState(2000)
  const [missionPackId, setMissionPackId] = useState<string | null>(references?.packs[0]?.id ?? null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: () =>
      createBattle({
        data: {
          ...(!solo ? { opponentIds } : {}),
          solo,
          limit,
          missionPackId,
        },
      }),
    onSuccess: async ({ token }) => {
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      return navigate({ to: '/battles/$token', params: { token } })
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>New battle</DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-none border-edge bg-panel p-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl uppercase">Start a battle</DialogTitle>
          <DialogDescription>Choose a shared battle or a private solo practice game.</DialogDescription>
        </DialogHeader>
        <fieldset>
          <legend className="eyebrow">Format</legend>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {FORMATS.map((format) => {
              const chosen = format.key === (solo ? 'solo' : teamBattle ? 'team' : 'duel')
              return (
                <Button
                  key={format.key}
                  variant={chosen ? 'default' : 'outline'}
                  aria-pressed={chosen}
                  className="h-auto flex-col items-start gap-0.5 px-2.5 py-2 text-left"
                  onClick={() => {
                    setSolo(format.key === 'solo')
                    setTeamBattle(format.key === 'team')
                    if (format.key !== 'team') setOpponentIds((ids) => ids.slice(0, 1))
                  }}
                >
                  <span className="font-bold uppercase">{format.name}</span>
                  <span className={`text-[0.625rem] leading-tight font-normal whitespace-normal ${chosen ? 'text-void/75' : 'text-dim'}`}>
                    {format.detail}
                  </span>
                </Button>
              )
            })}
          </div>
        </fieldset>
        {!solo && opponents.length ? (
          <div>
            <Label htmlFor="battle-opponent" className="eyebrow">
              {teamBattle ? 'Opponents' : 'Opponent'}
            </Label>
            <Select value={opponentIds[0] ?? null} onValueChange={(id) => id && setOpponentIds((current) => [id, ...current.slice(1)])}>
              <SelectTrigger id="battle-opponent" className="mt-1 h-11 w-full rounded-none border-edge bg-sunken">
                <SelectValue placeholder="Choose a player">
                  {(value: unknown) => opponents.find((opponent) => opponent.id === value)?.name ?? 'Choose a player'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {opponents
                  .filter((opponent) => opponent.id !== opponentIds[1])
                  .map((opponent) => (
                    <SelectItem key={opponent.id} value={opponent.id}>
                      {opponent.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {teamBattle ? (
              <Select
                value={opponentIds[1] ?? null}
                disabled={!opponentIds[0]}
                onValueChange={(id) => id && setOpponentIds((current) => (current[0] ? [current[0], id] : current))}
              >
                <SelectTrigger aria-label="Their ally" className="mt-2 h-11 w-full rounded-none border-edge bg-sunken">
                  <SelectValue placeholder="Choose their ally">
                    {(value: unknown) => opponents.find((opponent) => opponent.id === value)?.name ?? 'Choose their ally'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {opponents
                    .filter((opponent) => opponent.id !== opponentIds[0])
                    .map((opponent) => (
                      <SelectItem key={opponent.id} value={opponent.id}>
                        {opponent.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        ) : !solo ? (
          <p className="border border-edge bg-sunken p-3 text-sm text-dim">No other players have an account on this instance yet.</p>
        ) : null}
        <div>
          <Label className="eyebrow">Battle size</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {GAME_SIZES.map((size) => (
              <Button
                key={size.limit}
                variant={limit === size.limit ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLimit(size.limit)}
              >
                {size.name} · {size.limit}
              </Button>
            ))}
          </div>
        </div>
        {references?.packs.length ? (
          <div>
            <Label className="eyebrow">Mission pack</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {references.packs.map((pack) => (
                <Button
                  key={pack.id}
                  variant={missionPackId === pack.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMissionPackId(pack.id)}
                >
                  {pack.name}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {create.error ? <p className="text-sm text-destructive">{errorMessage(create.error)}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={(!solo && opponentIds.length < (teamBattle ? 2 : 1)) || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create battle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BattleShelf({
  title,
  battles,
  viewerId,
  onDelete,
}: {
  title: string
  battles: Battle[]
  viewerId: string
  onDelete: (battle: Battle) => void
}) {
  if (!battles.length) return null
  return (
    <section data-battle-shelf={title}>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>{title}</span>
        <span className="readout">{battles.length}</span>
      </p>
      <div className="mt-2 space-y-2">
        {battles.map((battle) => {
          const canDelete = battle.playerIds[0] === viewerId
          const label = battle.settings.solo ? 'Solo practice' : battle.players.join(' versus ')
          const actions = (
            <>
              <DropdownMenuItem render={<Link to="/battles/$token" params={{ token: battle.token }} />}>
                <Eye /> Open battle
              </DropdownMenuItem>
              {canDelete ? (
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(battle)}>
                  <Trash2 /> Delete battle
                </DropdownMenuItem>
              ) : null}
            </>
          )
          return (
            <ContextMenu key={battle.token}>
              <ContextMenuTrigger render={<article className="flex items-center border border-edge bg-panel hover:border-edge-strong" />}>
                <Link
                  to="/battles/$token"
                  params={{ token: battle.token }}
                  className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 p-3"
                >
                  <BattleSide
                    player={battle.players[0]}
                    army={battle.armies[0]}
                    detachments={battle.detachments[0]}
                    score={battle.scores[0]}
                    side="a"
                  />
                  <span className="text-center">
                    <span className="eyebrow block">{battle.status === 'playing' ? `Round ${battle.round}` : battle.status}</span>
                    <span className="block text-xs text-dim">
                      {battle.status === 'playing' ? `${battle.phase} phase · ` : ''}
                      {new Date(battle.lastActivity).toLocaleDateString()}
                    </span>
                    <span className="mt-1 block text-[0.625rem] text-faint">
                      {battle.settings.limit ? `${battle.settings.limit} pts` : 'Legacy format'}
                      {battle.mission ? ` · ${battle.mission.name}` : ''}
                      {battle.deploymentId ? ` · ${battle.deploymentId.replaceAll('-', ' ')}` : ''}
                      {battle.result?.reason ? ` · ${battle.result.reason.replaceAll('-', ' ')}` : ''}
                    </span>
                  </span>
                  <BattleSide
                    player={battle.players.slice(1).join(' & ') || undefined}
                    army={battle.armies.slice(1).filter(Boolean).join(' & ') || null}
                    detachments={battle.detachments.slice(1).flat()}
                    score={battle.scores[1]}
                    side="b"
                    emptyLabel={battle.settings.solo ? 'Solo practice' : 'Open seat'}
                    emptyArmy={battle.settings.solo ? 'Private battle' : 'Waiting for an opponent'}
                  />
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" className="mr-2" aria-label={`Actions for ${label}`} />}
                  >
                    <EllipsisVertical />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-none border border-edge bg-panel text-bone">
                    {actions}
                  </DropdownMenuContent>
                </DropdownMenu>
              </ContextMenuTrigger>
              <ContextMenuContent className="rounded-none border border-edge bg-panel text-bone">
                <ContextMenuItem render={<Link to="/battles/$token" params={{ token: battle.token }} />}>
                  <Eye /> Open battle
                </ContextMenuItem>
                {canDelete ? (
                  <ContextMenuItem variant="destructive" onClick={() => onDelete(battle)}>
                    <Trash2 /> Delete battle
                  </ContextMenuItem>
                ) : null}
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
      </div>
    </section>
  )
}

function BattleSide({
  player,
  army,
  detachments,
  score,
  side,
  emptyLabel = 'Open seat',
  emptyArmy = 'Waiting for an opponent',
}: {
  player?: string
  army?: string | null
  detachments?: string[]
  score?: number
  side: 'a' | 'b'
  emptyLabel?: string
  emptyArmy?: string
}) {
  const waiting = !player
  return (
    <span className={`min-w-0 ${side === 'b' ? 'text-right' : ''}`}>
      <span className={`readout block text-2xl ${side === 'a' ? 'text-side-a' : 'text-side-b'}`}>{score ?? 0}</span>
      <span className="block truncate font-bold uppercase">{player ?? emptyLabel}</span>
      <span className="block truncate text-xs text-dim">{army ?? (waiting ? emptyArmy : 'List not attached')}</span>
      {detachments?.length ? <span className="block truncate text-[0.625rem] text-faint">{detachments.join(' · ')}</span> : null}
    </span>
  )
}
