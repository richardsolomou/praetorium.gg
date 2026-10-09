import { Check } from 'lucide-react'
import { useEffect, useRef } from 'react'

export type RailStep = {
  name: string
  detail: string
  complete: boolean
}

type Props = {
  steps: RailStep[]
  at: number
  next: number
  onGo: (step: number) => void
}

/** The viewed section and the table's next decision are independent. */
export function StepRail({ steps, at, next, onGo }: Props) {
  const current = useRef<HTMLLIElement>(null)
  const rail = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const item = current.current
    const list = rail.current
    if (item && list) list.scrollTo({ left: item.offsetLeft - list.offsetLeft - (list.clientWidth - item.clientWidth) / 2 })
  }, [at])

  return (
    <nav aria-label="Setup sections">
      <ol ref={rail} className="flex items-stretch gap-1 overflow-x-auto">
        {steps.map((step, index) => {
          const here = index === at
          return (
            <li key={step.name} ref={here ? current : undefined} className="min-w-36 flex-1">
              <button
                type="button"
                data-step={step.name}
                data-complete={step.complete}
                aria-current={here ? 'location' : undefined}
                onClick={() => onGo(index)}
                className={`flex h-full w-full items-center gap-2 border-t-2 px-2 py-2 text-left transition-colors hover:bg-panel ${
                  here
                    ? 'border-t-info bg-panel'
                    : index === next
                      ? 'border-t-discarded'
                      : step.complete
                        ? 'border-t-achieved/60'
                        : 'border-t-edge-strong'
                }`}
              >
                <span
                  className={`readout grid size-5 shrink-0 place-items-center rounded-full text-3xs font-bold ${
                    step.complete
                      ? 'bg-achieved text-void'
                      : index === next
                        ? 'bg-discarded text-void'
                        : 'border border-edge-strong text-dim'
                  }`}
                >
                  {step.complete ? <Check className="size-3" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-xs font-bold uppercase ${here ? 'text-bone' : 'text-dim'}`}>{step.name}</span>
                  <span className="block truncate text-3xs text-faint">{step.detail}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
