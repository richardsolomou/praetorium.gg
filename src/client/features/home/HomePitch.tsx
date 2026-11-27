import { Link } from '@tanstack/react-router'
import {
  Bell,
  Boxes,
  ClipboardCheck,
  ClipboardPaste,
  Code,
  Crosshair,
  Heart,
  RefreshCw,
  RotateCcw,
  Swords,
  Trophy,
  Users,
  WandSparkles,
} from 'lucide-react'
import { buttonClass } from '../../components/buttonClass'
import { SOURCE, SPONSOR } from '../../projectLinks'

const COLUMNS = [
  {
    heading: 'Lists',
    features: [
      {
        icon: WandSparkles,
        title: 'Optimize your wargear',
        text: 'Find the loadout that does most against a target, or run one whole list against another.',
      },
      {
        icon: ClipboardCheck,
        title: 'Roster grades',
        text: 'Score a list out of 100 against tournament lists of the same size, centred on your faction’s, and see what it lacks.',
      },
      {
        icon: Trophy,
        title: 'Tournament lists',
        text: 'Browse top-four lists from recent events that are still legal today, and copy one to edit.',
      },
      {
        icon: RefreshCw,
        title: 'Points updates',
        text: 'Saved lists a points or datasheet update changed are flagged, so nothing is out of date on game day.',
      },
      {
        icon: Boxes,
        title: 'Your collection',
        text: 'Mark the models you own and filter the builder to them.',
      },
    ],
  },
  {
    heading: 'Games',
    features: [
      {
        icon: Bell,
        title: 'Ability reminders',
        text: 'Your abilities come up in the phase they apply to, only on your screen.',
      },
      {
        icon: RotateCcw,
        title: 'Replay and record',
        text: 'Every turn is kept, so a disagreement can be settled afterwards. Games against friends count in your record.',
      },
      {
        icon: Swords,
        title: 'Play your way',
        text: 'Play 1v1, 2v1 or 2v2 with friends, or a practice game on your own to learn the tracker.',
      },
      {
        icon: Users,
        title: 'Groups, leagues and tournaments',
        text: 'Keep a running table with your group, or run a tournament where everyone seals a list first.',
      },
      {
        icon: Crosshair,
        title: 'King of the Colosseum',
        text: 'The 600-point format, with its own limits in the builder and its own battlefield at the table.',
      },
    ],
  },
]

export function HomeFeatures() {
  return (
    <section data-home-features>
      <h2 className="text-2xl leading-none sm:text-3xl">For your lists and your games</h2>
      <div className="mt-5 grid gap-x-10 gap-y-6 md:grid-cols-2">
        {COLUMNS.map(({ heading, features }) => (
          <div key={heading} className="min-w-0">
            <h3 className="eyebrow text-faint">{heading}</h3>
            <ul className="runner mt-2">
              {features.map(({ icon: Icon, title, text }) => (
                <li key={title} className="min-w-0 border-b border-edge py-3.5 pl-2 last:border-0">
                  <h4 className="flex items-center gap-2 font-sans text-base leading-tight font-bold normal-case">
                    <Icon className="size-4 shrink-0 text-dim" aria-hidden />
                    {title}
                  </h4>
                  <p className="mt-1 text-sm leading-relaxed text-dim">{text}</p>
                </li>
              ))}
            </ul>
          </div>
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
            className="text-info underline underline-offset-4 hover:text-parchment"
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
          Paste a list from the official app, New Recruit, BattleBase and others, or a Praetorium exchange code. Review any unmatched units
          or options.
        </p>
        <Link to="/rosters" search={{ import: true }} className={buttonClass({ variant: 'outline', className: 'mt-5 w-full' })}>
          Try importing a list
        </Link>
      </aside>
    </section>
  )
}

export function HomeClosing() {
  return (
    <section className="masthead-bleed relative overflow-hidden border-t border-edge bg-masthead [--band-bottom:0px] [--band-top:1px]">
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:px-6 md:flex-row md:items-end md:justify-between md:py-16">
        <div>
          <h2 className="text-4xl leading-[0.9] sm:text-6xl">
            Build a list.
            <span className="block">Play the game.</span>
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
