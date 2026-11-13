import { forgetDeviceFilterPreferences } from '../../components/FilterBar'
import { hasLocalChanges, stopLocalRuntime } from '../../offline/localRuntime'
import { clearLocalState } from '../../offline/localStorage'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { GraduationCap, CircleUserRound, LogIn, LogOut, MessageSquareWarning, ShieldCheck, Sparkles, UserRoundPen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { posthog } from 'posthog-js'
import { authClient } from '../../authClient'
import { clearSavedApp } from '../../offline/appStorage'
import { reconcileAppAccount } from '../../offline/appSnapshot'
import { setNativeAccountMenuOpen } from '../../nativeBridge'
import { forgetThisDevice } from '../../pushNotifications'
import { clearWatchBattle } from '../battle/useWatchBattle'
import { meQuery } from '../../queries'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { openConversations, unreadReplies, useSupportTickets } from '../feedback/support'
import { errorMessage } from '../../queryClient'
import { OPEN_SYNC_EVENT } from '../../offline/SyncStatus'
import { countLabel } from '../../text'
import { useUnseenRelease } from './seenRelease'
import { DropdownMenuItem, MenuSection } from '../../components/Menu'
import { nameColour } from '../../playerName'

function useAccountControls() {
  const { data: me } = useQuery(meQuery())
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const signOut = () => {
    void (async () => {
      if (await hasLocalChanges()) {
        window.dispatchEvent(new CustomEvent(OPEN_SYNC_EVENT, { detail: 'sign-out' }))
        return
      }
      const owner = me?.id
      // Forgotten while the session still exists, since the server only lets an account remove its own device.
      await forgetThisDevice()
      const result = await authClient.signOut()
      if (result.error) throw new Error('Sign-out failed. Your saved work is still on this device. Try again.')
      stopLocalRuntime()
      clearWatchBattle()
      if (owner)
        await clearLocalState(owner).catch((error: unknown) => posthog.captureException(error, { operation: 'sign_out_local_work' }))
      forgetDeviceFilterPreferences()
      reconcileAppAccount(queryClient, null)
      queryClient.setQueryData(meQuery().queryKey, null)
      await clearSavedApp().catch((error: unknown) => posthog.captureException(error, { operation: 'sign_out_saved_data' }))
      await queryClient.invalidateQueries()
      await navigate({ to: '/' })
    })().catch((error: unknown) => {
      posthog.captureException(error, { operation: 'sign_out' })
      window.alert(errorMessage(error, 'Sign-out failed. Try again.'))
    })
  }

  return { me, signOut }
}

function AccountMenuItems() {
  const path = useLocation({ select: (location) => location.pathname })
  const href = useLocation({ select: (location) => location.href })
  const { me, signOut } = useAccountControls()
  const { tickets } = useSupportTickets()
  const unread = unreadReplies(tickets)
  const unseenRelease = useUnseenRelease()
  const help = (
    <MenuSection label="Praetorium">
      <DropdownMenuItem render={<Link to="/docs" />}>
        <GraduationCap /> Docs
      </DropdownMenuItem>
      <DropdownMenuItem render={<Link to="/whats-new" />}>
        <Sparkles />
        <span>What's new</span>
        {unseenRelease ? <span className="chip ml-auto border-parchment/30 text-parchment">New</span> : null}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={openConversations}>
        <MessageSquareWarning />
        <span>Feedback</span>
        {unread ? <span className="chip ml-auto border-discarded/50 bg-discarded/10 text-discarded">{unread} new</span> : null}
      </DropdownMenuItem>
    </MenuSection>
  )

  return (
    <>
      {me ? (
        <DropdownMenuItem
          render={<Link to="/users/$userId" params={{ userId: me.id }} search={{}} />}
          aria-label="My profile"
          className="gap-2.5 px-2 py-2"
        >
          <PlayerAvatar name={me.name} image={me.image} className="size-9 shrink-0 text-sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold" style={nameColour(me)}>
              {me.name}
            </span>
            <span className="block text-xs text-dim">View profile</span>
          </span>
        </DropdownMenuItem>
      ) : (
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5 px-2 py-2 font-normal">
            <CircleUserRound className="size-9 shrink-0 stroke-1 text-dim" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-bone">Not signed in</span>
              <span className="block text-xs text-dim">Sign in to keep your lists</span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
      )}
      <DropdownMenuSeparator />
      {me ? (
        <>
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link to="/profile" />}>
              <UserRoundPen /> Account settings
            </DropdownMenuItem>
            {me.role === 'admin' ? (
              <DropdownMenuItem render={<Link to="/admin" />}>
                <ShieldCheck /> Admin
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          {help}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </>
      ) : (
        <>
          <DropdownMenuItem render={<Link to="/sign-in" search={{ next: path === '/sign-in' ? undefined : href }} />}>
            <LogIn /> Sign in
          </DropdownMenuItem>
          {help}
        </>
      )}
    </>
  )
}

export function Account({ native = false, className = '' }: { native?: boolean; className?: string }) {
  const { me } = useAccountControls()
  const [nativeOpen, setNativeOpen] = useState(false)
  const { tickets } = useSupportTickets()
  const unread = unreadReplies(tickets)

  useEffect(() => {
    if (!native) return
    const setOpen = (event: Event) => setNativeOpen(Boolean((event as CustomEvent<{ open?: unknown }>).detail?.open))
    document.addEventListener('praetorium:set-account-menu', setOpen)
    return () => document.removeEventListener('praetorium:set-account-menu', setOpen)
  }, [native])

  return (
    <DropdownMenu
      open={native ? nativeOpen : undefined}
      onOpenChange={
        native
          ? (open) => {
              setNativeOpen(open)
              setNativeAccountMenuOpen(open)
            }
          : undefined
      }
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={native ? 'icon' : 'icon-sm'}
            className={`${native ? 'size-12' : ''} shrink-0 text-dim hover:bg-raised hover:text-info ${className}`}
            aria-label={`${me ? `Account menu for ${me.name}` : 'Account menu'}${unread ? `, ${countLabel(unread, 'unread feedback reply', 'unread feedback replies')}` : ''}`}
          />
        }
      >
        <span className="relative flex">
          {me ? <PlayerAvatar name={me.name} image={me.image} className="size-7 text-xs" /> : <CircleUserRound className="size-5" />}
          {unread ? (
            <span
              data-feedback-unread
              aria-hidden
              className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-panel bg-discarded"
            />
          ) : null}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <AccountMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
