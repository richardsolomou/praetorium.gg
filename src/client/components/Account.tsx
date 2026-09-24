import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { CircleUserRound, LogIn, LogOut, Map, MessageSquareWarning, ShieldCheck, UserRound, UserRoundPen, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { onboardingComplete, resolvedOnboardingTasks } from '../../core/onboarding'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { authClient } from '../authClient'
import { setNativeAccountMenuOpen } from '../nativeBridge'
import { onboardingTasks, openOnboarding } from '../onboarding'
import { forgetThisDevice } from '../pushNotifications'
import { meQuery, onboardingQuery } from '../queries'
import { PlayerAvatar } from './PlayerAvatar'

function useAccountControls() {
  const { data: me } = useQuery(meQuery())
  const { data: onboarding } = useQuery({ ...onboardingQuery(), enabled: Boolean(me) })
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const signOut = () => {
    void (async () => {
      // Forgotten while the session still exists, since the server only lets an account remove its own device.
      await forgetThisDevice()
      await authClient.signOut()
      await queryClient.invalidateQueries()
      await navigate({ to: '/' })
    })()
  }

  return { me, onboarding, signOut }
}

function AccountMenuItems() {
  const { me, onboarding, signOut } = useAccountControls()
  const onboardingResolved = onboarding ? resolvedOnboardingTasks(onboarding).size : 0
  const showOnboarding = onboarding && !onboardingComplete(onboarding)

  return (
    <>
      {me ? (
        <DropdownMenuItem
          render={<Link to="/users/$userId" params={{ userId: me.id }} search={{}} />}
          aria-label="My profile"
          className="items-start px-2 py-2"
        >
          <UserRound className="mt-0.5" />
          <span className="min-w-0">
            <span className="eyebrow block">Profile</span>
            <span className="mt-0.5 block truncate text-sm font-semibold text-bone">{me.name}</span>
          </span>
        </DropdownMenuItem>
      ) : (
        <DropdownMenuLabel className="px-2 py-2">
          <span className="eyebrow block">Account</span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-bone">Not signed in</span>
        </DropdownMenuLabel>
      )}
      <DropdownMenuSeparator />
      {me ? (
        <>
          <DropdownMenuItem render={<Link to="/profile" />}>
            <UserRoundPen /> Edit profile
          </DropdownMenuItem>
          {showOnboarding ? (
            <DropdownMenuItem onClick={openOnboarding}>
              <Map />
              <span>Getting started</span>
              <span className="ml-auto text-xs text-dim">
                {onboardingResolved}/{onboardingTasks.length}
              </span>
              {!onboarding.welcomed ? (
                <span className="chip border border-discarded/50 bg-discarded/10 px-1.5 py-0.5 text-discarded">New</span>
              ) : null}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem render={<Link to="/friends" />}>
            <Users /> Friends
          </DropdownMenuItem>
          {me.role === 'admin' ? (
            <DropdownMenuItem render={<Link to="/admin" />}>
              <ShieldCheck /> Admin
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            render={
              <a
                href="https://github.com/richardsolomou/praetorium.gg/issues"
                target="_blank"
                rel="noreferrer"
                aria-label="Send feedback"
              />
            }
          >
            <MessageSquareWarning /> Send feedback
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </>
      ) : (
        <DropdownMenuItem render={<Link to="/sign-in" search={{ next: undefined }} />}>
          <LogIn /> Sign in
        </DropdownMenuItem>
      )}
    </>
  )
}

export function Account({ native = false }: { native?: boolean }) {
  const { me, onboarding } = useAccountControls()
  const [nativeOpen, setNativeOpen] = useState(false)
  const onboardingNew = Boolean(onboarding && !onboarding.welcomed && !onboardingComplete(onboarding))

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
            className={`${native ? 'size-12' : ''} shrink-0 text-dim hover:bg-raised hover:text-info`}
            aria-label={me ? `Account menu for ${me.name}` : 'Account menu'}
          />
        }
      >
        {me ? (
          <span className="relative">
            <PlayerAvatar name={me.name} image={me.image} className="size-7 text-xs" />
            {onboardingNew ? (
              <span
                data-onboarding-new
                aria-hidden
                className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-panel bg-discarded"
              />
            ) : null}
          </span>
        ) : (
          <CircleUserRound className="size-5" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <AccountMenuItems />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
