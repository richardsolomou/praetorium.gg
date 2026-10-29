import { GuideHelp } from '../onboarding/GuideHelp'
import { pageLinkTabClass, pageLinkTabsClass } from '../../components/PageTabs'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Swords, Users } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClass } from '../../components/buttonClass'
import type { Battle } from './battle'
import { BattleShelf } from './BattleShelf'
import { CreateBattle } from './CreateBattle'
import { DeleteBattleDialog } from './DeleteBattle'
import { ImportBattlebase } from './ImportBattlebase'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { battlesFrom, battlesQuery, friendBattlesQuery, meQuery, publicBattlesQuery } from '../../queries'

/** Which whole list the page shows: Home lists the head of each, and links here for the rest. */
export type BattlesView = 'mine' | 'friends' | 'public'

const VIEWS: readonly [BattlesView, string][] = [
  ['mine', 'Mine'],
  ['friends', 'Friends'],
  ['public', 'Public'],
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
      {feed.isFetchingNextPage ? 'Loading…' : 'Show more battles'}
    </Button>
  ) : null

  return (
    <main className="w-full">
      <PageHeader
        eyebrow={me ? 'Your battles' : 'Community'}
        title={me ? 'Battles' : 'Public battles'}
        description={
          me ? 'Start a game, pick one up, or watch your friends and others play.' : 'Watch a game in progress or review a finished battle.'
        }
        actions={
          me ? (
            <>
              <GuideHelp task="battle">Battle guide</GuideHelp>
              {view === 'mine' ? <ImportBattlebase /> : null}
              {view === 'mine' && !battles.length ? null : <CreateBattle />}
            </>
          ) : (
            <Link to="/sign-in" search={{ next: '/battles' }} className={buttonClass()}>
              Sign in to play
            </Link>
          )
        }
      >
        {me ? (
          <nav aria-label="Battles" className={pageLinkTabsClass}>
            {VIEWS.map(([section, label]) => (
              <Link
                key={section}
                to="/battles"
                search={{ view: section === 'mine' ? undefined : section }}
                aria-current={view === section ? 'page' : undefined}
                className={pageLinkTabClass(view === section)}
              >
                {label}
              </Link>
            ))}
          </nav>
        ) : null}
      </PageHeader>
      <PageContent className="space-y-6">
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
              <BattleShelf name="Friends' games" battles={battles} />
              {more}
            </div>
          ) : (
            <div data-friends-empty>
              <PageState
                headingLevel={2}
                eyebrow="Friends' games"
                title="No friends' games yet."
                explanation="Games your friends play appear here, apart from the ones you sit in."
                icon={Users}
                action={
                  <Link to="/friends" className={buttonClass({ variant: 'outline' })}>
                    <Users /> Your friends
                  </Link>
                }
              />
            </div>
          )
        ) : battles.length ? (
          <div>
            <BattleShelf name="Public games" battles={battles} />
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
