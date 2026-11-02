import { Link } from '@tanstack/react-router'
import { Bell, Calculator, ClipboardPaste, Code, Crosshair, Heart, Layers3, LockKeyhole, RotateCcw, Swords, Users } from 'lucide-react'
import { buttonClass } from '../../components/buttonClass'
import { SOURCE, SPONSOR } from '../../projectLinks'

const FEATURES = [
  {
    icon: Calculator,
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
    title: 'Sealed-roster tournaments',
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
    text: 'Revisit each turn. Track your results by detachment, mission and battle size.',
  },
]

export function HomeFeatures() {
  const half = Math.ceil(FEATURES.length / 2)
  return (
    <section data-home-features>
      <h2 className="text-2xl leading-none sm:text-3xl">Built for your next battle</h2>
      <div className="mt-5 grid gap-x-10 md:grid-cols-2">
        {[FEATURES.slice(0, half), FEATURES.slice(half)].map((column) => (
          <ul key={column[0]?.title} className="runner [--gate-y:1.5rem]">
            {column.map(({ icon: Icon, title, text }) => (
              <li key={title} className="min-w-0 border-b border-edge py-3.5 pl-2 last:border-0">
                <h3 className="flex items-center gap-2 font-sans text-base leading-tight font-bold normal-case">
                  <Icon className="size-4 shrink-0 text-dim" aria-hidden />
                  {title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-dim">{text}</p>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  )
}

export function HomeIncluded() {
  return (
    <section data-home-included className="grid gap-4 lg:grid-cols-2">
      <div className="min-w-0 part p-5 sm:p-6">
        <h2 className="text-2xl leading-none">All free. No subscription.</h2>
        <p className="mt-4 max-w-2xl font-rules text-bone/80">
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
        <p className="mt-3 max-w-2xl font-rules text-bone/80">
          Once a visit has finished downloading, the reference, the simulator and your saved lists keep working offline.
        </p>
      </div>
      <aside data-home-import className="part p-5 sm:p-6">
        <ClipboardPaste className="size-6 text-info" aria-hidden />
        <h2 className="mt-4 text-2xl leading-none text-balance">Bring your existing lists</h2>
        <p className="mt-2 font-rules text-sm leading-relaxed text-dim">
          Paste a Games Workshop text export from BattleBase or New Recruit, or a Praetorium exchange code. Review any unmatched units or
          options.
        </p>
        <Link to="/rosters" className={buttonClass({ variant: 'outline', className: 'mt-5 w-full' })}>
          Try importing a list
        </Link>
      </aside>
    </section>
  )
}

export function HomeClosing() {
  return (
    <section className="masthead-bleed relative overflow-hidden border-t border-edge bg-masthead [--band-bottom:0px] [--band-top:1px]">
      <div className="construction-grid" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:px-6 md:flex-row md:items-end md:justify-between md:py-16">
        <div>
          <h2 className="text-4xl leading-[0.9] sm:text-6xl">
            Bring your
            <span className="block">next game.</span>
          </h2>
          <p className="mt-5 max-w-md font-rules text-dim">Free to use, and open source.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link to="/sign-in" search={{ next: undefined, join: true }} className={buttonClass({ size: 'lg' })}>
            Create an account
          </Link>
          <a href={SOURCE} className={buttonClass({ variant: 'outline', size: 'lg' })} rel="noreferrer noopener" target="_blank">
            <Code /> View the source
          </a>
          <a href={SPONSOR} className={buttonClass({ variant: 'outline', size: 'lg' })} rel="noreferrer noopener" target="_blank">
            <Heart /> Sponsor
          </a>
        </div>
      </div>
    </section>
  )
}
