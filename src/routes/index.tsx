import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { BookOpen, ChevronRight, ListChecks, Swords, Users } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { meQuery } from '../client/queries'

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery()),
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

  return (
    <main>
      <section className="relative overflow-hidden border-b border-edge bg-panel">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 md:grid-cols-[minmax(0,1fr)_20rem] md:items-center md:py-20">
          <div>
            <p className="eyebrow text-parchment">Shared battle command</p>
            <h1 className="mt-2 max-w-3xl text-4xl leading-[0.95] sm:text-5xl md:text-6xl">Build the force. Run the battle.</h1>
            <p className="mt-5 max-w-2xl text-base text-dim sm:text-lg">
              Praetorium builds Warhammer 40,000 army lists and keeps one live battle record across every player&apos;s device.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {me ? (
                <>
                  <Button render={<Link to="/battles" />} size="lg">
                    Open my battles <ChevronRight />
                  </Button>
                  <Button render={<Link to="/rosters/new" />} variant="outline" size="lg">
                    Build a roster
                  </Button>
                </>
              ) : (
                <>
                  <Link to="/sign-in" search={{ next: undefined }} className={buttonVariants({ size: 'lg' })}>
                    Sign in
                  </Link>
                  <Button render={<Link to="/mission-packs" />} variant="outline" size="lg">
                    Browse missions
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="relative mx-auto grid size-64 place-items-center md:size-80" aria-hidden>
            <div className="absolute inset-0 rotate-45 border border-parchment/25" />
            <div className="absolute inset-8 -rotate-12 border border-edge-strong bg-sunken/70" />
            <img src="/logo.svg" alt="" className="relative size-36 drop-shadow-[0_0_2rem_rgba(137,184,157,0.2)] md:size-44" />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10">
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
            <p className="eyebrow">Private by design</p>
            <p className="mt-1 text-sm text-dim">
              Friends form private battles. Praetorium has no chat, feed, matchmaking, or public discovery.
            </p>
          </div>
          <Button render={<Link to="/friends" />} variant="outline" className="shrink-0">
            <Users /> Manage friends
          </Button>
        </div>
      </section>
    </main>
  )
}
