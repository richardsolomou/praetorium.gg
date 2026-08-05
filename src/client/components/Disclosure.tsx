import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  children: ReactNode
  className?: string
  triggerClassName?: string
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function Disclosure({ label, children, className, triggerClassName, open, defaultOpen, onOpenChange }: Props) {
  return (
    <Collapsible className={className} open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className={cn('group flex cursor-pointer items-center gap-1', triggerClassName)}>
        <ChevronRight className="size-3 transition-transform group-data-panel-open:rotate-90" aria-hidden />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}
