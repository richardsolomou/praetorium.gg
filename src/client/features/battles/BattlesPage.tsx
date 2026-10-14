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
import { battlesFrom, battlesQuery, friendBattlesQuery, meQuery, publicBattlesQuery } from '../../queries'
import { FriendTables } from '../home/HomeFeed'

/** Which whole list the page shows: Home lists the head of each, and links here for the rest. */
export type BattlesView = 'mine' | 'friends' | 'public'

const VIEWS: readonly [BattlesView, string][] = [
  ['mine', 'Mine'],
  ['friends', "Friends' games"],
  ['public', 'Public games'],
]

export function BattlesPage({ view: asked }: { view: BattlesView }) {
  const { data: me } = useQuery(meQuery())
  // A visitor has no games of their own and no friends, so every battle they may see is public.
  const view = me ? asked : 'public'
  const feed = useInfiniteQuery(view === 'mine' ? battlesQuery() : view === 'friends' ? friendBattlesQuery() : publicBattlesQuery())
  const battles = battlesFrom(feed.data)
  const [deleting, setDeleting] = useState<Battle | null>(null)
  const more = feed.hasNextPage ? (
    <Button variant="outline" size="sm" className="mt-2" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
      {feed.isFetchingNextPage ? 'Loading…' : 'Show earlier battles'}
    </Button>
  ) : null

  return (
    <main className="w-full">
      <PageHeader
        eyebrow={me ? 'Your battles' : 'Community'}
        title={me ? 'Battles' : 'Public battles'}
        description={
          me
            ? 'Start a game, return to one in progress, or look back over every game you, your friends and everyone else have played.'
            : 'Watch a game in progress or review a finished battle.'
        }
        actions={
          me ? (
            // An empty list of the player's own offers the action in its own empty state.
            view === 'mine' && !battles.length ? null : (
              <CreateBattle />
            )
          ) : (
            <Link to="/sign-in" search={{ next: '/battles' }} className={buttonVariants()}>
              Sign in to play
            </Link>
          )
        }
      >
        {me ? (
          <nav aria-label="Battles" className="flex gap-6">
            {VIEWS.map(([section, label]) => (
              <Link
                key={section}
                to="/battles"
                search={{ view: section === 'mine' ? undefined : section }}
                aria-current={view === section ? 'page' : undefined}
                className={`min-h-11 content-center border-b-2 text-sm font-semibold ${view === section ? 'border-parchment text-parchment' : 'border-transparent text-dim hover:border-edge-strong hover:text-bone'}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        ) : null}
      </PageHeader>
      <PageContent className="space-y-10 sm:pt-6">
        {view === 'mine' ? (
          battles.length ? (
            <>
              <BattleShelf
                title="In progress"
                battles={battles.filter((battle) => battle.status !== 'finished')}
                viewerId={me?.id}
                onDelete={setDeleting}
              />
              <div>
                <BattleShelf
                  title="Finished"
                  battles={battles.filter((battle) => battle.status === 'finished')}
                  viewerId={me?.id}
                  onDelete={setDeleting}
                />
                {more}
              </div>
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
          )
        ) : view === 'friends' ? (
          battles.length ? (
            <div>
              <BattleShelf title="Friends' games" battles={battles} />
              {more}
            </div>
          ) : (
            <FriendTables battles={[]} explain />
          )
        ) : battles.length ? (
          <div>
            <BattleShelf title="Public games" battles={battles} />
            {more}
          </div>
        ) : (
          <PageState
            headingLevel={2}
            eyebrow="Public battles"
            title={me ? 'No other public battles yet.' : 'No public battles yet.'}
            explanation={
              me
                ? "Other players' public games appear here; your own are under Mine."
                : 'Games will appear here when players start a public battle.'
            }
            icon={Swords}
          />
        )}
      </PageContent>
      <DeleteBattleDialog battle={deleting} onClose={() => setDeleting(null)} />
    </main>
  )
}
