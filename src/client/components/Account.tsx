import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  CircleUserRound,
  LogIn,
  LogOut,
  MessageSquareWarning,
  ScrollText,
  ShieldCheck,
  Swords,
  Trophy,
  UserRound,
  UserRoundPen,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
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
import { meQuery } from '../queries'
import { PlayerAvatar } from './PlayerAvatar'

function useAccountControls() {
  const { data: me } = useQuery(meQuery())
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const signOut = () => {
    void (async () => {
      await authClient.signOut()
      await queryClient.invalidateQueries()
      await navigate({ to: '/' })
    })()
  }

  return { me, signOut }
}

function AccountMenuItems() {
  const { me, signOut } = useAccountControls()

  return (
    <>
      <DropdownMenuLabel className="px-2 py-2">
        <span className="eyebrow block">{me ? 'Profile' : 'Account'}</span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-bone">{me?.name ?? 'Not signed in'}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {me ? (
        <>
          <DropdownMenuItem render={<Link to="/users/$userId" params={{ userId: me.id }} search={{}} />}>
            <UserRound /> My profile
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/profile" />}>
            <UserRoundPen /> Edit profile
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/battles" />}>
            <Swords /> My battles
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/rosters" />}>
            <ScrollText /> My rosters
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/leagues" />}>
            <Trophy /> Leagues
          </DropdownMenuItem>
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
  const { me } = useAccountControls()
  const [nativeOpen, setNativeOpen] = useState(false)

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
        {me ? <PlayerAvatar name={me.name} image={me.image} className="size-7 text-xs" /> : <CircleUserRound className="size-5" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-none border border-edge bg-panel">
        <DropdownMenuGroup>
          <AccountMenuItems />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
