import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
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
