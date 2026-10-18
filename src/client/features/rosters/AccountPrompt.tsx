import { Link } from '@tanstack/react-router'
import { posthog } from 'posthog-js'
import { useCallback, useState } from 'react'
import { buttonClass } from '../../components/buttonClass'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { GUEST_PATH } from './guestDraft'

/** What a visitor tried that needs an account, as the prompt's title and its telemetry name it. */
export type AccountReason = 'another-roster' | 'variant' | 'loadout' | 'share' | 'lock' | 'archive' | 'lend' | 'battle'

const TITLE: Record<AccountReason, string> = {
  'another-roster': 'Keep more than one roster',
  variant: 'Make variants with an account',
  loadout: 'Save loadouts with an account',
  share: 'Share rosters with an account',
  lock: 'Lock rosters with an account',
  archive: 'Archive rosters with an account',
  lend: 'Lend rosters with an account',
  battle: 'Start battles with an account',
}

/**
 * The one roster a visitor keeps on this device, and what a free account adds to it.
 *
 * Both links come back to the rosters page, which saves the device's roster to the new account.
 */
function AccountPrompt({ reason, onClose }: { reason: AccountReason | null; onClose: () => void }) {
  const seen = (action: 'create' | 'sign_in') => posthog.capture('guest_roster_account_prompt_followed', { reason, action })
  return (
    <Dialog open={Boolean(reason)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm" fit>
        <DialogHeader>
          <DialogTitle className="text-2xl">{reason ? TITLE[reason] : null}</DialogTitle>
          <DialogDescription>
            Without an account, this device keeps one roster. Create a free account and it moves into it. You also get:
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ul className="list-disc space-y-1 pl-5 text-sm text-dim">
            <li>As many rosters as you like, with variants to compare builds</li>
            <li>Saved unit loadouts to add again in any roster</li>
            <li>Links to share them, and lending to friends</li>
            <li>Locking and archiving to keep your library tidy</li>
            <li>Your rosters and battles on any device</li>
            <li>Your own record, a place on the leaderboard and league standings</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/sign-in"
              search={{ next: GUEST_PATH, join: true }}
              className={buttonClass({ size: 'sm' })}
              onClick={() => seen('create')}
            >
              Create an account
            </Link>
            <Link
              to="/sign-in"
              search={{ next: GUEST_PATH }}
              className={buttonClass({ variant: 'ghost', size: 'sm' })}
              onClick={() => seen('sign_in')}
            >
              I already have an account
            </Link>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

/** Asks a visitor to sign up for something an account does, with the prompt to render beside whatever asked. */
export function useAccountPrompt() {
  const [reason, setReason] = useState<AccountReason | null>(null)
  const ask = useCallback((next: AccountReason) => {
    posthog.capture('guest_roster_account_prompt_viewed', { reason: next })
    setReason(next)
  }, [])
  return {
    ask,
    prompt: <AccountPrompt reason={reason} onClose={() => setReason(null)} />,
  }
}
