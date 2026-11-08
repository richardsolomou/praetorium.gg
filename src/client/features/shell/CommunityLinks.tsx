import { Medal, Trophy, UserRound, Users } from 'lucide-react'
import { offlineData } from '../../offline/runtime'
import { DISCORD, SOURCE } from '../../projectLinks'
import discordIcon from './discord.svg?no-inline'
import discordOfflineIcon from './discord.svg'
import githubIcon from './github.svg?no-inline'
import githubOfflineIcon from './github.svg'

function brandIcon(online: string, offline: string) {
  return function BrandIcon({ className }: { className?: string }) {
    return <img src={offlineData() ? offline : online} alt="" aria-hidden className={className} />
  }
}

export const COMMUNITY_PAGES = [
  { to: '/groups', label: 'Groups', Icon: Users },
  { to: '/tournaments', label: 'Tournaments', Icon: Trophy },
  { to: '/leaderboard', label: 'Leaderboard', Icon: Medal },
] as const

export const FRIENDS_PAGE = { to: '/friends', label: 'Friends', Icon: UserRound } as const

export const COMMUNITY_LINKS = [
  { href: DISCORD, Icon: brandIcon(discordIcon, discordOfflineIcon), label: 'Discord' },
  { href: SOURCE, Icon: brandIcon(githubIcon, githubOfflineIcon), label: 'GitHub' },
]
