import { GuideHelp } from '../onboarding/GuideHelp'
import { pageLinkTabClass, pageLinkTabsClass } from '../../components/PageTabs'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Swords, Users } from 'lucide-react'
import { useState } from 'react'
import { buttonClass } from '../../components/buttonClass'
import { battleFilterActive } from '../../../core/battleFilter'
import type { Battle } from './battle'
import { BattleFilters } from './BattleFilters'
import type { BattleOrder } from '../../../core/battleFilter'
import { battleFilterOf, type BattleListSearch, type BattlesView } from './battleSearch'
import { NoFilterMatches } from '../../components/NoFilterMatches'
import { BattleShelf } from './BattleShelf'
import { MoreBattles } from './BattleFeedList'
import { NewBattle } from './NewBattle'
import { DraftResume } from './DraftResume'
import { DeleteBattleDialog } from './DeleteBattle'
import { ImportBattles } from './ImportBattles'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { battlesFrom, battlesQuery, friendBattlesQuery, meQuery, publicBattlesQuery } from '../../queries'

const VIEWS: readonly [BattlesView, string][] = [
  ['mine', 'Mine'],
  ['friends', 'Friends'],
  ['public', 'Public'],
]

export function BattlesPage({ view: asked, search, order }: { view: BattlesView; search: BattleListSearch; order?: BattleOrder }) {
  const { data: me } = useQuery(meQuery())
  // A visitor has no games of their own and no friends, so every battle they may see is public.
  const view = me ? asked : 'public'
  const filter = battleFilterOf(search)
  const filtered = battleFilterActive(filter)
  const feed = useInfiniteQuery({
    ...(view === 'mine'
      ? battlesQuery(filter, order)
      : view === 'friends'
        ? friendBattlesQuery(filter, order)
        : publicBattlesQuery(filter, order)),
    placeholderData: keepPreviousData,
  })
  const battles = battlesFrom(feed.data)
  const [deleting, setDeleting] = useState<Battle | null>(null)
  const navigate = useNavigate()
  const go = (next: BattleListSearch, nextOrder: BattleOrder | undefined) =>
    void navigate({
      to: '/battles',
      search: { ...(view === 'mine' ? {} : { view }), ...(nextOrder ? { order: nextOrder } : {}), ...next },
      replace: true,
      resetScroll: false,
    })
  const choose = (next: BattleListSearch) => go(next, order)
  const more = <MoreBattles feed={feed} filtered={filtered} order={order} />
  const noMatches = filtered && !battles.length && !feed.isPending
  const matches = noMatches ? (
    <div>
      <NoFilterMatches>
        {feed.hasNextPage ? 'None of the battles searched so far match.' : 'No battles match these filters.'}
      </NoFilterMatches>
      {more}
    </div>
  ) : null

  return (
    <main className="w-full">
      <PageHeader
        title={me ? 'Battles' : 'Public battles'}
        description={
          me ? 'Start a game, pick one up, or watch your friends and others play.' : 'Watch a game in progress or review a finished battle.'
        }
        actions={
          me ? (
            <>
              {view === 'mine' ? <ImportBattles /> : null}
              {view === 'mine' && !battles.length ? null : <NewBattle />}
            </>
          ) : (
            <Link to="/sign-in" search={{ next: '/battles' }} className={buttonClass()}>
              Sign in to play
            </Link>
          )
        }
        help={me ? <GuideHelp task="battle">Battle guide</GuideHelp> : null}
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
        {battles.length || filtered ? (
          <BattleFilters
            view={view}
            search={search}
            onChange={choose}
            order={order}
            onOrder={(next) => go(search, next)}
            signedIn={Boolean(me)}
            updating={feed.isPlaceholderData}
          />
        ) : null}
        {view === 'mine' && !filtered ? <DraftResume /> : null}
        {matches ??
          (view === 'mine' ? (
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
                title="No battles yet."
                explanation="Practise on your own, or add a friend and start a game together."
                icon={Swords}
                action={<NewBattle />}
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
              title={me ? 'No other public battles yet.' : 'No public battles yet.'}
              explanation={
                me
                  ? "Other players' public games appear here; your own are under Mine."
                  : 'Games will appear here when players start a public battle.'
              }
              icon={Swords}
            />
          ))}
      </PageContent>
      <DeleteBattleDialog battle={deleting} onClose={() => setDeleting(null)} />
    </main>
  )
}
