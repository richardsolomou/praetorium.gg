import { ShieldCheck } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function AdminBadge() {
  return (
    <Tooltip>
      <TooltipTrigger
        closeOnClick={false}
        render={
          <button
            type="button"
            data-admin-badge
            aria-label="Admin"
            className="inline-flex items-center gap-1.5 rounded-sm border border-info/60 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-info)_24%,var(--color-sunken)),color-mix(in_srgb,var(--color-info)_8%,var(--color-sunken)))] px-2 py-0.5 align-middle text-2xs font-semibold tracking-eyebrow text-info uppercase shadow-[0_0.25rem_0.75rem_-0.25rem_color-mix(in_srgb,var(--color-info)_50%,transparent)] transition-colors hover:border-info focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
          />
        }
      >
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        Admin
      </TooltipTrigger>
      <TooltipContent role="tooltip" side="right">
        Praetorium administrator
      </TooltipContent>
    </Tooltip>
  )
}
