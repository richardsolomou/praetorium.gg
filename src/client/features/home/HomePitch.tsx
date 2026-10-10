import { Link } from '@tanstack/react-router'
import { Bell, ChevronRight, ClipboardPaste, Code, Crosshair, Heart, Layers3, LockKeyhole, RotateCcw, Swords, Users } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { SOURCE, SPONSOR } from '../../projectLinks'

const FEATURES = [
  {
    icon: Crosshair,
    title: 'Combat simulator',
    text: 'Compare loadouts and see shooting and melee odds before committing.',
  },
  {
    icon: Layers3,
    title: 'Unlimited lists & variants',
    text: 'Check points and legality. Compare variants, share, print and export.',
  },
  {
    icon: Bell,
    title: 'Ability reminders',
    text: 'Private reminders for your abilities, timed to phases, turns and rounds.',
  },
  {
    icon: Swords,
    title: 'Live battle tracking',
    text: 'Track phases, scores, CP, stratagems, casualties and turn times together.',
  },
  {
    icon: Users,
    title: 'Team & practice games',
    text: 'Play 1v1, 2v1 or 2v2 with friends, or practise solo.',
  },
  {
    icon: LockKeyhole,
    title: 'Sealed league rosters',
    text: 'Approve entries, reveal lists together and play with the sealed armies.',
  },
  {
    icon: Crosshair,
    title: 'King of the Colosseum',
    text: 'Build and battle at 600 points with the format’s own limits and battlefield.',
  },
  {
    icon: RotateCcw,
    title: 'Battle replay & stats',
    text: 'Revisit each turn. Track your results by detachment, mission and game size.',
  },
]

export function HomeFeatures() {
  return (
    <section data-home-features className="border border-edge bg-panel/50 p-5 sm:p-6">
      <h2 className="text-2xl leading-none text-parchment sm:text-3xl">Built for your next battle</h2>
      <div className="mt-6 grid border-t border-edge md:grid-cols-2 md:gap-x-10">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <article key={title} className="min-w-0 border-b border-edge py-5">
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 size-5 shrink-0 text-parchment" aria-hidden />
              <h3 className="text-xl leading-tight">{title}</h3>
            </div>
            <p className="mt-3 font-rules text-base leading-relaxed text-dim">{text}</p>
          </article>
        ))}
      </div>
      <Link to="/simulator" className={buttonVariants({ variant: 'outline', className: 'mt-6' })}>
        Try a combat matchup <ChevronRight aria-hidden />
      </Link>
    </section>
  )
}

export function HomeIncluded() {
  return (
    <section data-home-included className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-16">
      <div className="min-w-0 border-l-2 border-parchment bg-parchment/5 p-5 sm:p-6">
        <h2 className="text-2xl leading-none text-parchment sm:text-3xl">All free. No subscription.</h2>
        <p className="mt-4 max-w-2xl font-rules text-dim">
          Every feature is free. Save lists and play with an account. Help keep it running:{' '}
          <a
            href={SPONSOR}
            className="text-info underline-offset-4 hover:text-parchment hover:underline"
            rel="noreferrer noopener"
            target="_blank"
          >
            sponsor it on GitHub
          </a>
          . Sponsors get a badge, not extra features.
        </p>
      </div>
      <aside data-home-import className="border border-info/30 bg-info/5 p-5">
        <ClipboardPaste className="size-6 text-info" aria-hidden />
        <h2 className="mt-4 text-xl leading-tight text-balance">Bring your existing lists</h2>
        <p className="mt-2 font-rules text-sm leading-relaxed text-dim">
          Paste a Games Workshop text export from BattleBase or New Recruit. Review any unmatched units or options.
        </p>
        <Link to="/rosters" className={buttonVariants({ className: 'mt-5 w-full' })}>
          Try importing a list
        </Link>
      </aside>
    </section>
  )
}

export function HomeClosing() {
  return (
    <section className="relative overflow-hidden border-t border-edge bg-panel">
      <div className="plot-grid" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:px-6 md:flex-row md:items-end md:justify-between md:py-16">
        <div>
          <h2 className="text-3xl leading-[0.9] sm:text-4xl">
            Bring your
            <span className="block text-parchment">next game.</span>
          </h2>
          <p className="mt-5 max-w-md font-rules text-dim">Free to use, and open source.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link to="/sign-in" search={{ next: undefined, join: true }} className={buttonVariants({ size: 'lg' })}>
            Create an account
          </Link>
          <a href={SOURCE} className={buttonVariants({ variant: 'outline', size: 'lg' })} rel="noreferrer noopener" target="_blank">
            <Code /> View the source
          </a>
          <a href={SPONSOR} className={buttonVariants({ variant: 'outline', size: 'lg' })} rel="noreferrer noopener" target="_blank">
            <Heart /> Sponsor
          </a>
        </div>
      </div>
    </section>
  )
}
