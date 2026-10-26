import { RulesVersionLabel } from './RulesVersionLabel'
import { type CatalogueEdition, editionLabel } from '../../core/catalogueEdition'
import { Archive, FlaskConical } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePressTooltip } from './HoverTooltip'

const appearances = {
  retired: { Icon: Archive, colour: 'border-edge-strong text-dim' },
  preview: { Icon: FlaskConical, colour: 'border-discarded/40 text-discarded' },
}

export function RulesVersionBadge({ edition }: { edition: Pick<CatalogueEdition, 'id' | 'name' | 'status' | 'description'> }) {
  const label = editionLabel(edition)
  const { open, onOpenChange, show } = usePressTooltip()
  if (edition.status === 'released') return null
  const { Icon, colour } = appearances[edition.status]
  // oxlint-disable jsx-a11y/prefer-tag-over-role -- A native button would nest inside faction selector buttons.
  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger
        closeOnClick={false}
        render={
          <span
            role="button"
            tabIndex={0}
            aria-label={`Rules version: ${label}`}
            data-rules-version={edition.id}
            className={`absolute -right-1 -bottom-0.5 inline-flex size-3.5 items-center justify-center rounded-full border bg-panel cursor-help focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info ${colour}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              show(true)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              event.stopPropagation()
              show(true)
            }}
          />
        }
      >
        <Icon className="size-2.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent role="tooltip">
        <div>
          <RulesVersionLabel faction={{ edition }} />
          {edition.description ? <p className="mt-1 max-w-64 text-dim">{edition.description}</p> : null}
        </div>
      </TooltipContent>
    </Tooltip>
  )
  // oxlint-enable jsx-a11y/prefer-tag-over-role
}
