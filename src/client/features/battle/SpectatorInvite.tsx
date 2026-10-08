import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import type { BattleView } from '../../../core/battleView'
import { meQuery, onboardingQuery } from '../../queries'
import { dismissSpectatorInvite, spectatorInviteOffer, spectatorInviteSuppressed, subscribeSpectatorInvite } from './spectatorInviteState'

const ACTION = 'max-sm:h-11'

/**
 * A way into the product for someone watching a battle they are not seated in.
 *
 * It sits in the page flow, so it never covers the scoreboard or the timeline. The
 * server draws it for a signed-out reader, who is most of the audience, so it does
 * not push the page down after hydration; a dismissal is read in the browser only.
 */
export function SpectatorInvite({ view, className }: { view: BattleView; className?: string }) {
  const seated = view.players.some((player) => player.isViewer)
  const { data: me } = useQuery(meQuery())
  const { data: progress } = useQuery({ ...onboardingQuery(), enabled: Boolean(me) && !seated })
  const offer = spectatorInviteOffer({ seated, me, progress })
  const suppressed = useSyncExternalStore(subscribeSpectatorInvite, spectatorInviteSuppressed, () => false)
  const visible = offer !== null && !suppressed
  const signedIn = Boolean(me)
  const properties = { status: view.status, offer, signed_in: signedIn }
  const shown = useRef(false)

  useEffect(() => {
    if (!visible || shown.current) return
    shown.current = true
    posthog.capture('spectator_invite_shown', { status: view.status, offer, signed_in: signedIn })
  }, [offer, signedIn, view.status, visible])

  if (!visible) return null
  const follow = (action: 'roster' | 'battle') => () => posthog.capture('spectator_invite_followed', { ...properties, action })

  return (
    <aside data-spectator-invite aria-labelledby="spectator-invite-title" className={`flex items-start gap-3 ${className ?? ''}`}>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p id="spectator-invite-title" className="text-sm font-semibold text-bone">
            Track your own games on Praetorium
          </p>
          <p className="text-xs text-dim">
            {offer === 'battle'
              ? 'Start a battle with your army and score it round by round, like this one.'
              : 'Build your army for free, then score your battles round by round, like this one.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {offer === 'roster' ? (
            <Link to="/rosters" onClick={follow('roster')} className={buttonVariants({ size: 'sm', className: ACTION })}>
              Build an army
            </Link>
          ) : null}
          {me && offer === 'battle' ? (
            <Link to="/battles" onClick={follow('battle')} className={buttonVariants({ size: 'sm', className: ACTION })}>
              Start a battle
            </Link>
          ) : null}
          {/* Creating a battle needs an account, so a signed-out reader signs up on the way to it. */}
          {me ? null : (
            <Link
              to="/sign-in"
              search={{ next: '/battles', join: true }}
              rel="nofollow"
              onClick={follow('battle')}
              className={buttonVariants({ variant: 'outline', size: 'sm', className: ACTION })}
            >
              Start a battle
            </Link>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss"
        className="-mt-1 -mr-1 shrink-0 text-dim max-sm:size-11"
        onClick={() => {
          posthog.capture('spectator_invite_dismissed', properties)
          dismissSpectatorInvite()
        }}
      >
        <X />
      </Button>
    </aside>
  )
}
