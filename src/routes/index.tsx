import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { BookOpen, ChevronRight, Code, ListChecks, Swords, Users } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { BattleShelf } from '../client/components/battles/BattleShelf'
import { CreateBattle } from '../client/components/battles/CreateBattle'
import { StandingsGlimpse } from '../client/components/Standings'
import { battlesFrom, battlesQuery, friendBattlesQuery, meQuery, publicBattlesQuery, standingsQuery } from '../client/queries'
import { useLiveBattles } from '../client/useLiveBattle'

/** The repository, which is the product's other front door. */
const SOURCE = 'https://github.com/richardsolomou/praetorium.gg'

/**
 * Everything the home page shows is on it at first paint.
 *
 * The feeds are the page rather than an afterthought below it, so fetching them
 * after hydration would leave the first frame a hero over empty space and then
 * move it. A visitor with no account still gets the public feed and the
 * standings, because those are what say the instance is being played.
 */
export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery())
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(publicBattlesQuery()),
      context.queryClient.ensureQueryData(standingsQuery()),
      ...(me
        ? [context.queryClient.ensureInfiniteQueryData(battlesQuery()), context.queryClient.ensureInfiniteQueryData(friendBattlesQuery())]
        : []),
    ])
  },
  component: Home,
})

const CAPABILITIES = [
  {
    icon: ListChecks,
    title: 'Build the army',
    text: 'Pick units and loadouts from verified community catalogues. Praetorium calculates points and reports unsupported rules.',
    link: '/rosters' as const,
    action: 'Open rosters',
  },
  {
    icon: Swords,
    title: 'Share the battle',
    text: 'Play 1v1, 2v1, or 2v2, against friends or practice opponents. Every seated phone reads the same command log, phase, resources, and score.',
    link: '/battles' as const,
    action: 'Open battles',
  },
  {
    icon: BookOpen,
    title: 'Use the mission',
    text: 'Read mission packs, force-disposition matchups, deployment plans, terrain layouts, and scoring cards.',
    link: '/mission-packs' as const,
    action: 'View mission packs',
  },
]

function Home() {
  const { data: me } = useQuery(meQuery())
  // Being added to a battle happens on someone else's device, so this page is told.
  useLiveBattles(Boolean(me))
  return (
    <main>
      {me ? <PlayerWelcome name={me.name} /> : <Hero />}
      <div className="mx-auto w-full max-w-5xl space-y-6 px-3 py-6 sm:px-4">
        {me ? <MyTable viewerId={me.id} /> : null}
        <Tables signedIn={Boolean(me)} />
        <Leaderboard />
      </div>
      <Capabilities />
    </main>
  )
}

/** The signed-out introduction: what this is, and the two ways in. */
function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-edge bg-panel">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 md:grid-cols-[minmax(0,1fr)_20rem] md:items-center md:py-20">
        <div>
          <p className="eyebrow text-parchment">Free and open source</p>
          <h1 className="mt-2 max-w-3xl text-4xl leading-[0.95] sm:text-5xl md:text-6xl">Build the force. Run the battle.</h1>
          <p className="mt-5 max-w-2xl text-base text-dim sm:text-lg">
            Praetorium builds Warhammer 40,000 army lists and keeps one live battle record across every player&apos;s device. Watch the
            battles below as they are played.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Link to="/sign-in" search={{ next: undefined }} className={buttonVariants({ size: 'lg' })}>
              Create an account
            </Link>
            <Button render={<Link to="/mission-packs" />} variant="outline" size="lg">
              Browse missions
            </Button>
          </div>
        </div>
        <div className="relative mx-auto grid size-64 place-items-center md:size-80" aria-hidden>
          <div className="absolute inset-0 rotate-45 border border-parchment/25" />
          <div className="absolute inset-8 -rotate-12 border border-edge-strong bg-sunken/70" />
          <img src="/logo.svg" alt="" className="relative size-36 drop-shadow-[0_0_2rem_rgba(137,184,157,0.2)] md:size-44" />
        </div>
      </div>
    </section>
  )
}

/**
 * The signed-in header, which is short on purpose.
 *
 * The mobile shell opens here, so the first thing a player who already has games
 * needs is the games — not the pitch they have already accepted.
 */
function PlayerWelcome({ name }: { name: string }) {
  return (
    <section className="relative overflow-hidden border-b border-edge bg-panel">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
      <div className="relative mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4 px-3 py-5 sm:px-4 sm:py-7">
        <div>
          <p className="eyebrow text-parchment">Praetorium</p>
          <h1 className="mt-1 text-3xl">Welcome back, {name.trim().split(/\s+/)[0]}</h1>
          <p className="mt-2 max-w-2xl text-sm text-dim">
            Return to a battle, open a new one, or watch how the rest of the table is doing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CreateBattle />
          <Button render={<Link to="/rosters/new" />} variant="outline">
            Build a roster
          </Button>
        </div>
      </div>
    </section>
  )
}

/** The player's own games, live ones first. Finished history stays on the battles page. */
function MyTable({ viewerId }: { viewerId: string }) {
  const { data } = useInfiniteQuery(battlesQuery())
  const battles = battlesFrom(data)
  const going = battles.filter((battle) => battle.status !== 'finished').slice(0, 4)
  if (!going.length) {
    return (
      <section data-my-table className="border border-edge bg-panel p-5">
        <p className="eyebrow flex items-center gap-2 text-parchment">
          <Swords className="size-4" aria-hidden /> Your table
        </p>
        <p className="mt-2 max-w-lg text-sm text-dim">
          Nothing is on the table. Open a battle against a friend or a practice opponent, and every seated phone reads the same log.
        </p>
        <div className="mt-4">
          <CreateBattle />
        </div>
      </section>
    )
  }
  return (
    <div>
      <BattleShelf title="Your table" battles={going} viewerId={viewerId} />
      <Link to="/battles" className="eyebrow mt-2 inline-flex items-center gap-1 text-info hover:text-parchment">
        All my battles <ChevronRight className="size-3.5" />
      </Link>
    </div>
  )
}

/**
 * Everyone else's tables: the player's friends first, then the rest of the instance.
 *
 * The two shelves are drawn together because a friend's battle is usually public
 * as well, and the server can only remove what it knows the reader has seen — it
 * takes their own seats out of the public list, but the friends list is a second
 * query it has no answer from. So the naming shelf wins: a row appears under
 * Friends' tables or under Public tables, never under both.
 */
function Tables({ signedIn }: { signedIn: boolean }) {
  const { data: friends } = useInfiniteQuery({ ...friendBattlesQuery(), enabled: signedIn })
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(publicBattlesQuery())
  const friendBattles = signedIn ? battlesFrom(friends).slice(0, 5) : []
  const named = new Set(friendBattles.map((battle) => battle.token))
  const publicBattles = battlesFrom(data).filter((battle) => !named.has(battle.token))
  if (!friendBattles.length && !publicBattles.length) {
    return signedIn ? null : (
      <section data-public-empty className="border border-edge bg-sunken p-5">
        <p className="eyebrow text-parchment">Public tables</p>
        <p className="mt-2 text-sm text-dim">No battles are being played right now. Create an account and open the first one.</p>
      </section>
    )
  }
  return (
    <>
      <BattleShelf title="Friends' tables" battles={friendBattles} />
      <BattleShelf title="Public tables" battles={publicBattles} />
      {hasNextPage ? (
        <Button variant="outline" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {isFetchingNextPage ? 'Loading…' : 'Show more battles'}
        </Button>
      ) : null}
    </>
  )
}

/** A glance at who is leading, not the leaderboard itself. That has its own page. */
function Leaderboard() {
  const { data } = useQuery(standingsQuery())
  if (!data) return null
  return <StandingsGlimpse tables={data} />
}

/** What the app does, and where the code is. */
function Capabilities() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-10">
      <div className="grid gap-px border border-edge bg-edge md:grid-cols-3">
        {CAPABILITIES.map(({ icon: Icon, title, text, link, action }) => (
          <article key={title} className="group bg-panel p-5 transition-colors hover:bg-raised">
            <Icon className="size-6 text-parchment" aria-hidden />
            <h2 className="mt-5 text-xl">{title}</h2>
            <p className="mt-2 min-h-16 text-sm text-dim">{text}</p>
            <Link to={link} className="eyebrow mt-5 inline-flex items-center gap-1 text-info group-hover:text-parchment">
              {action} <ChevronRight className="size-3.5" />
            </Link>
          </article>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-4 border border-edge bg-sunken p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Built in the open</p>
          <p className="mt-1 text-sm text-dim">
            Praetorium is free and open source under the AGPL. Read the code, report a problem, or send a change.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a href={SOURCE} className={buttonVariants({ variant: 'outline' })} rel="noreferrer noopener" target="_blank">
            <Code /> View the source
          </a>
          <Button render={<Link to="/friends" />} variant="ghost">
            <Users /> Friends
          </Button>
        </div>
      </div>
    </section>
  )
}
