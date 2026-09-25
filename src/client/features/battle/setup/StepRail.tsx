import { Check } from 'lucide-react'
import { useEffect, useRef } from 'react'

export type Step = {
  name: string
  detail: string
  complete: boolean
  /** Whether everything this section needs settling first has been settled. */
  reachable: boolean
}

type Props = {
  steps: Step[]
  at: number
  onGo: (step: number) => void
}

/** Setup navigation is shared battle state. Keep section names readable at every width and scroll the current section into view. */
export function StepRail({ steps, at, onGo }: Props) {
  const current = useRef<HTMLLIElement>(null)
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [at])

  return (
    <nav aria-label="Setup sections">
      <ol className="flex items-stretch gap-1 overflow-x-auto">
        {steps.map((step, index) => {
          const here = index === at
          return (
            <li key={step.name} ref={here ? current : undefined} className="min-w-36 flex-1">
              <button
                type="button"
                disabled={!step.reachable}
                data-step={step.name}
                data-complete={step.complete}
                aria-current={here ? 'step' : undefined}
                onClick={() => onGo(index)}
                className={`flex h-full w-full items-center gap-2 border-t-2 px-2 py-2 text-left transition-colors disabled:cursor-not-allowed ${
                  here ? 'border-t-discarded bg-panel' : step.complete ? 'border-t-achieved/60 hover:bg-panel' : 'border-t-edge-strong'
                } ${step.reachable ? '' : 'opacity-45'}`}
              >
                <span
                  className={`readout grid size-5 shrink-0 place-items-center rounded-full text-3xs font-bold ${
                    step.complete ? 'bg-achieved text-void' : here ? 'bg-discarded text-void' : 'border border-edge-strong text-dim'
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
