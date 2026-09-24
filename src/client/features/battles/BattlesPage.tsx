import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Swords } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Battle } from './battle'
import { BattleShelf } from './BattleShelf'
import { CreateBattle } from './CreateBattle'
import { DeleteBattleDialog } from './DeleteBattle'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { SignInRequired } from '../../components/SignInRequired'
import { battlesFrom, battlesQuery, meQuery } from '../../queries'
import { useLiveBattles } from '../../useLiveBattle'

export function BattlesPage() {
  const { data: me } = useQuery(meQuery())
  const { data: pages, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(battlesQuery())
  const battles = battlesFrom(pages)
  const [deleting, setDeleting] = useState<Battle | null>(null)
  // Being added to a battle happens on someone else's device, so this page is told.
  useLiveBattles(Boolean(me))
  if (!me) return <SignInRequired title="Your battles" explanation="Sign in to see the battles you have played and the ones still going." />
  const active = battles.filter((battle) => battle.status === 'playing')
  const setup = battles.filter((battle) => battle.status === 'setup')
  const finished = battles.filter((battle) => battle.status === 'finished')

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Your battles"
        title="My battles"
        description="Start a game, return to one in progress, or review a finished battle."
        actions={battles.length ? <CreateBattle /> : null}
      />
      <PageContent className="space-y-6">
        {battles.length ? (
          <>
            <BattleShelf title="Active" battles={active} viewerId={me.id} onDelete={setDeleting} />
            <BattleShelf title="Setup" battles={setup} viewerId={me.id} onDelete={setDeleting} />
            <BattleShelf title="Finished" battles={finished} viewerId={me.id} onDelete={setDeleting} />
            {hasNextPage ? (
              <Button variant="outline" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                {isFetchingNextPage ? 'Loading…' : 'Show earlier battles'}
              </Button>
            ) : null}
          </>
        ) : (
          <PageState
            headingLevel={2}
            eyebrow="Your battles"
            title="No battles yet."
            explanation="Practise on your own, or add a friend and start a game together."
            icon={Swords}
            action={<CreateBattle />}
          />
        )}
      </PageContent>
      <DeleteBattleDialog battle={deleting} onClose={() => setDeleting(null)} />
    </main>
  )
}
