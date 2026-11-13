import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { meQuery } from '../../../queries'
import { GuideHelp } from '../../onboarding/GuideHelp'

/** The page's title and what it is for this reader, above who is playing whom. */
export function SetupHeader({
  token,
  watching,
  draft,
  children,
}: {
  token: string
  watching: boolean
  /** Still a draft, which waits for everyone to join with an army. */
  draft: boolean
  /** The face-off and what it says below the title. */
  children: ReactNode
}) {
  const { data: me } = useQuery(meQuery())
  return (
    <header className="relative space-y-5 pb-2">
      <div aria-hidden className="construction-grid -inset-x-3 -top-6 sm:-inset-x-4" />
      <div className="relative space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl text-balance sm:text-3xl">
            {watching ? 'Battle setup' : 'Set up the battle'}
            {draft ? <span className="chip align-middle font-sans text-xs text-dim">Draft</span> : null}
          </h1>
          {watching ? (
            me ? null : (
              <Link
                to="/sign-in"
                search={{ next: `/battles/${token}` }}
                rel="nofollow"
                className="shrink-0 text-xs text-info hover:text-bone"
              >
                Sign in to play
              </Link>
            )
          ) : (
            <GuideHelp task="battle" step="battle-setup-size">
              Battle setup guide
            </GuideHelp>
          )}
        </div>
        <p className="max-w-prose text-sm text-dim sm:text-base">
          {watching
            ? 'The players are still setting up. Their choices show here, and the battle opens on this page once they start.'
            : draft
              ? 'A draft until everyone has joined with an army.'
              : 'In the order the rules play it. Anyone at the table can answer for either side.'}
        </p>
      </div>
      {children}
    </header>
  )
}
