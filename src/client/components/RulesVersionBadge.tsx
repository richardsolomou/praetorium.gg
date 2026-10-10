import { type CatalogueEdition, editionLabel } from '../../core/catalogueEdition'
import { Layers2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function RulesVersionBadge({ edition }: { edition: Pick<CatalogueEdition, 'id' | 'name' | 'status'> }) {
  const label = editionLabel(edition)
  const [open, setOpen] = useState(false)
  const openedByPress = useRef(false)
  // oxlint-disable jsx-a11y/prefer-tag-over-role -- A native button would nest inside faction selector buttons.
  return (
    <Tooltip
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen && openedByPress.current && details.reason !== 'outside-press' && details.reason !== 'escape-key') return
        if (!nextOpen) openedByPress.current = false
        setOpen(nextOpen)
      }}
    >
      <TooltipTrigger
        closeOnClick={false}
        render={
          <span
            role="button"
            tabIndex={0}
            aria-label={`Rules version: ${label}`}
            data-rules-version={edition.id}
            className="absolute -right-1 -bottom-0.5 inline-flex size-3.5 items-center justify-center rounded-full border border-edge-strong bg-panel text-dim cursor-help focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              openedByPress.current = true
              setOpen(true)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              event.stopPropagation()
              openedByPress.current = true
              setOpen(true)
            }}
          />
        }
      >
        <Layers2 className="size-2.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent role="tooltip">{label}</TooltipContent>
    </Tooltip>
  )
  // oxlint-enable jsx-a11y/prefer-tag-over-role
}
