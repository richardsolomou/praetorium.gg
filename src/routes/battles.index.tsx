import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Swords } from 'lucide-react'
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
import type { Battle } from '../client/components/battles/battle'
import { BattleShelf } from '../client/components/battles/BattleShelf'
import { CreateBattle } from '../client/components/battles/CreateBattle'
import { SignInRequired } from '../client/components/SignInRequired'
import { battlesFrom, battlesQuery, meQuery } from '../client/queries'
import { useLiveBattles } from '../client/useLiveBattle'
import { deleteBattle } from '../server/functions'

export const Route = createFileRoute('/battles/')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(meQuery()), context.queryClient.ensureInfiniteQueryData(battlesQuery())]),
  component: Battles,
})

function Battles() {
  const { data: me } = useQuery(meQuery())
  const { data: pages, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(battlesQuery())
  const battles = battlesFrom(pages)
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
    <main className="w-full">
      <section className="relative overflow-hidden border-b border-edge bg-panel">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4 px-3 py-5 sm:px-4 sm:py-7">
          <div>
            <p className="eyebrow text-parchment">Your battles</p>
            <h1 className="mt-1 text-3xl">My battles</h1>
            <p className="mt-2 max-w-2xl text-sm text-dim">Start a game, return to one in progress, or review a finished battle.</p>
          </div>
          {battles.length ? <CreateBattle /> : null}
        </div>
      </section>
      {battles.length ? (
        <div className="mx-auto mt-4 max-w-5xl space-y-6 px-3 pb-8 sm:px-4">
          <BattleShelf title="Active" battles={active} viewerId={me.id} onDelete={setDeleting} />
          <BattleShelf title="Setup" battles={setup} viewerId={me.id} onDelete={setDeleting} />
          <BattleShelf title="Finished" battles={finished} viewerId={me.id} onDelete={setDeleting} />
          {hasNextPage ? (
            <div className="pb-2">
              <Button variant="outline" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                {isFetchingNextPage ? 'Loading…' : 'Show earlier battles'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mx-auto mt-4 grid max-w-5xl place-items-center border-y border-edge bg-panel px-6 py-10 text-center sm:border sm:py-12">
          <span className="grid size-14 place-items-center rounded-full border border-edge-strong bg-sunken text-parchment">
            <Swords className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-xl">No battles yet.</h2>
          <p className="mt-2 max-w-md text-sm text-dim">Practise on your own, or add a friend and start a game together.</p>
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
              This permanently deletes the battle, including its scores and history.
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
