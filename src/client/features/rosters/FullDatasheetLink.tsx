import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Datasheet } from '../../../contracts/catalogue'

export function FullDatasheetLink({ route }: { route: NonNullable<Datasheet['referenceRoute']> }) {
  return (
    <Tooltip>
      <TooltipTrigger
        closeOnClick={false}
        render={
          <Link
            data-slot="full-datasheet-link"
            to="/factions/$catalogueId/datasheets/$entryId"
            params={{ catalogueId: route.catalogueId, entryId: route.slug }}
            target="_blank"
            rel="noreferrer"
            aria-label="Open full datasheet in a new tab"
            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
          />
        }
      >
        <ExternalLink />
      </TooltipTrigger>
      <TooltipContent role="tooltip" side="bottom">
        Open full datasheet in a new tab
      </TooltipContent>
    </Tooltip>
  )
}

export function FullDatasheetLinkLoading() {
  return (
    <span data-slot="full-datasheet-link" aria-hidden className={`${buttonVariants({ variant: 'ghost', size: 'icon-sm' })} text-faint`}>
      <ExternalLink />
    </span>
  )
}
