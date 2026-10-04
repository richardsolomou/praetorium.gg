import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Swords } from 'lucide-react'
import { useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Battle } from './battle'
import { BattleShelf } from './BattleShelf'
import { CreateBattle } from './CreateBattle'
import { DeleteBattleDialog } from './DeleteBattle'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { battlesFrom, battlesQuery, meQuery, publicBattlesQuery } from '../../queries'

export function BattlesPage() {
  const { data: me } = useQuery(meQuery())
  const { data: pages, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(me ? battlesQuery() : publicBattlesQuery())
  const battles = battlesFrom(pages)
  const [deleting, setDeleting] = useState<Battle | null>(null)
  const active = battles.filter((battle) => battle.status === 'playing')
  const setup = battles.filter((battle) => battle.status === 'setup')
  const finished = battles.filter((battle) => battle.status === 'finished')

  return (
    <main className="w-full">
      <PageHeader
        eyebrow={me ? 'Your battles' : 'Community'}
        title={me ? 'My battles' : 'Public battles'}
        description={
          me
            ? 'Start a game, return to one in progress, or review a finished battle.'
            : 'Watch a game in progress or review a finished battle.'
        }
        actions={
          me ? (
            battles.length ? (
              <CreateBattle />
            ) : null
          ) : (
            <Link to="/sign-in" search={{ next: '/battles' }} className={buttonVariants()}>
              Sign in to play
            </Link>
          )
        }
      />
      <PageContent className="space-y-6">
        {battles.length ? (
          <>
            <BattleShelf title="Active" battles={active} viewerId={me?.id} onDelete={me ? setDeleting : undefined} />
            <BattleShelf title="Setup" battles={setup} viewerId={me?.id} onDelete={me ? setDeleting : undefined} />
            <BattleShelf title="Finished" battles={finished} viewerId={me?.id} onDelete={me ? setDeleting : undefined} />
            {hasNextPage ? (
              <Button variant="outline" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                {isFetchingNextPage ? 'Loading…' : 'Show earlier battles'}
              </Button>
            ) : null}
          </>
        ) : (
          <PageState
            headingLevel={2}
            eyebrow={me ? 'Your battles' : 'Public battles'}
            title={me ? 'No battles yet.' : 'No public battles yet.'}
            explanation={
              me
                ? 'Practise on your own, or add a friend and start a game together.'
                : 'Games will appear here when players start a public battle.'
            }
            icon={Swords}
            action={me ? <CreateBattle /> : undefined}
          />
        )}
      </PageContent>
      <DeleteBattleDialog battle={deleting} onClose={() => setDeleting(null)} />
    </main>
  )
}
