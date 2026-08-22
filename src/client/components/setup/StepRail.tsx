import { Check } from 'lucide-react'

export type Step = { name: string; detail: string; complete: boolean }

type Props = { steps: Step[]; at: number; onGo: (step: number) => void }

/**
 * The six sections, across the top rather than down the side.
 *
 * The section is folded from the log, so pressing one moves every seated device to
 * it — the rail is the shared place in setup, not a private table of contents.
 */
export function StepRail({ steps, at, onGo }: Props) {
  return (
    <nav aria-label="Setup sections">
      <ol className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {steps.map((step, index) => {
          const current = index === at
          const reachable = index <= at
          return (
            <li key={step.name}>
              <button
                type="button"
                disabled={!reachable}
                data-complete={step.complete}
                aria-current={current ? 'step' : undefined}
                onClick={() => onGo(index)}
                className={`flex w-full items-center gap-2 border-t-2 px-2 py-2 text-left transition-colors disabled:cursor-not-allowed ${
                  current ? 'border-t-discarded bg-panel' : step.complete ? 'border-t-achieved/60 hover:bg-panel' : 'border-t-edge-strong'
                } ${reachable ? '' : 'opacity-45'}`}
              >
                <span
                  className={`readout grid size-5 shrink-0 place-items-center rounded-full text-[0.625rem] font-bold ${
                    step.complete ? 'bg-achieved text-void' : current ? 'bg-discarded text-void' : 'border border-edge-strong text-dim'
                  }`}
                >
                  {step.complete ? <Check className="size-3" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-xs font-bold uppercase ${current ? 'text-bone' : 'text-dim'}`}>{step.name}</span>
                  <span className="block truncate text-[0.625rem] text-faint">{step.detail}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
