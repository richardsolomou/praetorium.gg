import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CircleDot, Flag, Settings2, Swords } from 'lucide-react'
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
import type { Battle } from '../client/components/battles/battle'
import { BattleShelf } from '../client/components/battles/BattleShelf'
import { CreateBattle } from '../client/components/battles/CreateBattle'
import { SignInRequired } from '../client/components/SignInRequired'
import { battlesQuery, gameReferencesQuery, meQuery, opponentsQuery } from '../client/queries'
import { useLiveBattles } from '../client/useLiveBattle'
import { deleteBattle } from '../server/functions'

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
  const active = battles.filter((battle) => battle.status === 'playing')
  const setup = battles.filter((battle) => battle.status === 'setup')
  const finished = battles.filter((battle) => battle.status === 'finished')

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex items-end justify-between gap-4 border-b border-edge pb-4">
        <div>
          <p className="eyebrow">Your battles</p>
          <h1 className="text-3xl">My battles</h1>
        </div>
        {battles.length ? <CreateBattle /> : null}
      </div>
      <div className="mt-5 grid gap-px border border-edge bg-edge sm:grid-cols-3">
        <BattleStat icon={CircleDot} label="Active" value={active.length} tone="text-parchment" />
        <BattleStat icon={Settings2} label="In setup" value={setup.length} tone="text-info" />
        <BattleStat icon={Flag} label="Finished" value={finished.length} tone="text-dim" />
      </div>
      {battles.length ? (
        <div className="mt-5 space-y-6">
          <BattleShelf title="Active" battles={active} viewerId={me.id} onDelete={setDeleting} />
          <BattleShelf title="Setup" battles={setup} viewerId={me.id} onDelete={setDeleting} />
          <BattleShelf title="Finished" battles={finished} viewerId={me.id} onDelete={setDeleting} />
        </div>
      ) : (
        <div className="mt-5 grid place-items-center border border-edge bg-panel px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-full border border-edge-strong bg-sunken text-parchment">
            <Swords className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-xl">No battles yet.</h2>
          <p className="mt-2 max-w-md text-sm text-dim">
            Start a solo practice battle, or add friends and open a shared game. Setup keeps every player on the same step.
          </p>
          <div className="mt-5">
            <CreateBattle />
          </div>
        </div>
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

function BattleStat({ icon: Icon, label, value, tone }: { icon: typeof Swords; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-3 bg-panel p-4">
      <Icon className={`size-5 ${tone}`} aria-hidden />
      <span>
        <span className="readout block text-2xl">{value}</span>
        <span className="eyebrow text-faint">{label}</span>
      </span>
    </div>
  )
}
