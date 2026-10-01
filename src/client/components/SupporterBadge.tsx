import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SPONSOR } from '../projectLinks'

/**
 * A sponsor's insignia: the logo's own centre, the nested diamond, struck as a seal.
 *
 * Light crosses it once when the profile opens and again on hover or focus; the
 * global reduced-motion rule leaves it still.
 */
export function SupporterBadge() {
  return (
    <Tooltip>
      <TooltipTrigger
        closeOnClick={false}
        render={
          <a
            href={SPONSOR}
            data-supporter-badge
            aria-label="Supporter"
            rel="noreferrer noopener"
            target="_blank"
            className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-sm border border-parchment/45 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-parchment)_20%,transparent),color-mix(in_srgb,var(--color-parchment)_4%,transparent))] py-0.5 pr-2 pl-1 align-middle text-2xs font-semibold tracking-eyebrow text-parchment uppercase shadow-[0_0.25rem_0.75rem_-0.25rem_color-mix(in_srgb,var(--color-parchment)_40%,transparent)] transition-colors hover:border-parchment focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
          />
        }
      >
        <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden>
          <path d="m8 1 7 7-7 7-7-7Z" fill="var(--color-sunken)" stroke="var(--color-bone)" strokeWidth="1.25" />
          <path d="m8 4.5 3.5 3.5L8 11.5 4.5 8Z" fill="currentColor" />
        </svg>
        Supporter
        <span
          className="pointer-events-none absolute inset-0 animate-supporter-glint bg-[linear-gradient(105deg,transparent_42%,color-mix(in_srgb,var(--color-bone)_45%,transparent)_50%,transparent_58%)] bg-[length:250%_100%] bg-no-repeat group-hover:animate-supporter-glint-again group-focus-visible:animate-supporter-glint-again"
          aria-hidden
        />
      </TooltipTrigger>
      <TooltipContent role="tooltip" side="right">
        Sponsors Praetorium on GitHub
      </TooltipContent>
    </Tooltip>
  )
}
