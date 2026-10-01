import { Link } from '@tanstack/react-router'
import { Check, ClipboardPaste, Code, Heart } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

/** The repository, which is the product's other front door. */
export const SOURCE = 'https://github.com/richardsolomou/praetorium.gg'

const SPONSOR = 'https://github.com/sponsors/richardsolomou'

const INCLUDED = [
  { title: 'Unlimited lists', text: 'Save, copy and vary as many rosters as you like.' },
  { title: 'Every battle shape', text: '1v1, 2v1 and 2v2, or a practice game alone.' },
  { title: 'King of the Colosseum', text: 'Its own size, caps and borrowed dispositions.' },
  { title: 'Leagues', text: 'Entry approval and rosters sealed until the reveal.' },
  { title: 'Live tracking', text: 'Phases, command points, stratagems and scoring on every device.' },
  { title: 'Combat simulator', text: 'Shooting and melee odds for any two units.' },
  { title: 'Watchable games', text: 'A link anyone can follow, and a public leaderboard.' },
  { title: 'Print and export', text: 'Print a list or copy it as Games Workshop text.' },
]

const STEPS = [
  {
    title: 'Build the list',
    text: 'Points and legality checked as you build.',
  },
  {
    title: 'Set the table',
    text: '1v1, 2v1 or 2v2, or practise alone. Pick the mission, deployment and terrain.',
  },
  {
    title: 'Play on any device',
    text: 'Everyone follows the same game: phases, command points, scoring and casualties.',
  },
  {
    title: 'Look back',
    text: 'Finished games build your record and the leaderboard.',
  },
]

/**
 * How a game runs here, for somebody deciding whether to bring theirs.
 *
 * Drawn as one line with a marker per stage, the diamond the logo stands on,
 * because these are the order a game actually happens in rather than four
 * features that could be read in any order. Each step says what the app does:
 * a visitor reads this before they know the navigation, and "track the battle"
 * promises nothing a paper tally does not.
 */
export function HomeSteps() {
  return (
    <section data-home-steps>
      <h2 className="text-2xl leading-none sm:text-3xl">From list to final score</h2>
      <ol className="mt-6 grid gap-6 sm:mt-8 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4 lg:gap-0">
        {STEPS.map(({ title, text }, index) => (
          <li key={title} className="min-w-0 lg:pr-8">
            {/* The line joining the markers only reads as a sequence when the steps sit in one row. */}
            <span className="mb-4 hidden items-center gap-3 lg:flex" aria-hidden>
              <span className="size-2.5 shrink-0 rotate-45 bg-parchment" />
              {index < STEPS.length - 1 ? <span className="h-px flex-1 bg-edge-strong" /> : null}
            </span>
            <h3 className="flex items-center gap-3 text-lg leading-tight">
              <span className="size-2 shrink-0 rotate-45 bg-parchment lg:hidden" aria-hidden />
              {title}
            </h3>
            <p className="mt-2 max-w-sm font-rules text-sm leading-relaxed text-dim">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * What a player would otherwise pay for elsewhere, and the way their lists come with them.
 *
 * The included list is what is free, said without naming who charges for it,
 * because another app's tiers change and a stale comparison reads worse than none.
 * Importing needs an account, so its door is the sign-up that leads to the library.
 */
export function HomeIncluded() {
  return (
    <section data-home-included className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-16">
      <div className="min-w-0">
        <h2 className="text-2xl leading-none sm:text-3xl">Nothing is locked</h2>
        <p className="mt-4 max-w-2xl font-rules text-dim">
          Every format and every tool is free.{' '}
          <a
            href={SPONSOR}
            className="text-info underline-offset-4 hover:text-parchment hover:underline"
            rel="noreferrer noopener"
            target="_blank"
          >
            Sponsoring the project
          </a>{' '}
          helps keep it running and unlocks nothing, because there is nothing to unlock.
        </p>
        <ul className="mt-6 grid border-t border-edge sm:grid-cols-2 sm:gap-x-10">
          {INCLUDED.map(({ title, text }) => (
            <li key={title} className="flex min-w-0 items-start gap-3 border-b border-edge py-3.5">
              <Check className="mt-0.5 size-4 shrink-0 text-parchment" aria-hidden />
              <span className="min-w-0">
                <span className="block leading-tight font-bold uppercase">{title}</span>
                <span className="mt-1 block font-rules text-sm text-dim">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <aside data-home-import className="border border-edge-strong bg-sunken p-5 shadow-[0_1.5rem_3rem_-1rem_rgba(0,0,0,0.6)]">
        <ClipboardPaste className="size-6 text-parchment" aria-hidden />
        <h2 className="mt-4 text-xl leading-tight">Bring your lists</h2>
        <p className="mt-2 font-rules text-sm leading-relaxed text-dim">
          Copy a list as Games Workshop text from New Recruit or BattleBase and paste it in. Every unit is matched to its datasheet, and
          anything that could not be placed is named back to you.
        </p>
        <Link to="/sign-in" search={{ next: '/rosters', join: true }} className={buttonVariants({ className: 'mt-5 w-full' })}>
          Create an account to import
        </Link>
      </aside>
    </section>
  )
}

/**
 * The last thing a visitor reads: the hero's invitation again, and the promise behind it.
 *
 * A band the width of the page, like the hero it answers, so the page closes on the
 * same note it opened on. The code being open is what the product offers instead of
 * a subscription, so it is said beside the sign-up rather than in a box of its own.
 */
export function HomeClosing() {
  return (
    <section className="relative overflow-hidden border-t border-edge bg-panel">
      <div className="sheen" />
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
