import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { buttonClass } from '../../components/buttonClass'
import { offlineData } from '../../offline/runtime'
import { DISCORD, SOURCE } from '../../projectLinks'
import discordIcon from './discord.svg?no-inline'
import discordOfflineIcon from './discord.svg'
import githubIcon from './github.svg?no-inline'
import githubOfflineIcon from './github.svg'

const links = [
  { href: DISCORD, icon: discordIcon, offlineIcon: discordOfflineIcon, label: 'Discord', description: 'Join the Discord community' },
  { href: SOURCE, icon: githubIcon, offlineIcon: githubOfflineIcon, label: 'GitHub', description: 'Browse the source on GitHub' },
]

export function CommunityLinks({ compact = false }: { compact?: boolean }) {
  return (
    <nav aria-label="Community" className="inline-flex shrink-0 items-center gap-1">
      {links.map(({ href, icon, offlineIcon, label, description }) => (
        <Tooltip key={label}>
          <TooltipTrigger
            render={
              <a
                href={href}
                aria-label={label}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonClass({ variant: 'ghost', size: 'icon', className: compact ? 'size-8' : 'size-[44px]' })}
              />
            }
          >
            <img src={offlineData() ? offlineIcon : icon} alt="" aria-hidden className="size-4.5" />
          </TooltipTrigger>
          <TooltipContent role="tooltip">{description}</TooltipContent>
        </Tooltip>
      ))}
    </nav>
  )
}
