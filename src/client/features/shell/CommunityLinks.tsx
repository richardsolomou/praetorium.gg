import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { buttonClass } from '../../components/buttonClass'
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

export const COMMUNITY_LINKS = [
  { href: DISCORD, Icon: brandIcon(discordIcon, discordOfflineIcon), label: 'Discord', description: 'Join the Discord community' },
  { href: SOURCE, Icon: brandIcon(githubIcon, githubOfflineIcon), label: 'GitHub', description: 'Browse the source on GitHub' },
]

export function CommunityLinks() {
  return (
    <nav aria-label="Community" className="inline-flex shrink-0 items-center gap-1">
      {COMMUNITY_LINKS.map(({ href, Icon, label, description }) => (
        <Tooltip key={label}>
          <TooltipTrigger
            render={
              <a
                href={href}
                aria-label={label}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonClass({ variant: 'ghost', size: 'icon', className: 'size-8' })}
              />
            }
          >
            <Icon className="size-4.5" />
          </TooltipTrigger>
          <TooltipContent role="tooltip">{description}</TooltipContent>
        </Tooltip>
      ))}
    </nav>
  )
}
