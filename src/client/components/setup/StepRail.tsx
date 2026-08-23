import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
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
  /** Why the step will not be left yet, which is what closes the way forward. */
  blocked: string | null
}

/**
 * The sections of setup and the two arrows that move between them, as one rail.
 *
 * The section is folded from the log, so pressing one moves every seated device to
 * it — this is the shared place in setup, not a private table of contents. Back and
 * next are ends of the same rail rather than buttons beside it: they answer the
 * question the rail asks, and drawn as their own controls they read as a second
 * thing to look at above a step that is already asking for something.
 *
 * Which sections can be pressed is the caller's to say, because it is the same
 * question as what still has to be settled before one is left behind.
 *
 * The sections fill the rail where they fit and scroll where they do not: each one
 * grows into whatever room there is, and none is allowed narrower than its name. Six
 * of them do not fit a phone at a readable size, and numbering them instead left a
 * player counting chips to work out where they were — so each keeps its name at
 * every width and the rail slides, carrying the current one into view whenever the
 * table moves.
 */
export function StepRail({ steps, at, onGo, blocked }: Props) {
  const current = useRef<HTMLLIElement>(null)
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [at])

  return (
    <nav aria-label="Setup sections" className="flex items-stretch gap-1">
      <RailArrow label="Back" disabled={at === 0} onClick={() => onGo(Math.max(0, at - 1))}>
        <ChevronLeft className="size-4" />
      </RailArrow>
      <ol className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
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
                  className={`readout grid size-5 shrink-0 place-items-center rounded-full text-[0.625rem] font-bold ${
                    step.complete ? 'bg-achieved text-void' : here ? 'bg-discarded text-void' : 'border border-edge-strong text-dim'
                  }`}
                >
                  {step.complete ? <Check className="size-3" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-xs font-bold uppercase ${here ? 'text-bone' : 'text-dim'}`}>{step.name}</span>
                  <span className="block truncate text-[0.625rem] text-faint">{step.detail}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <RailArrow label="Next" forward disabled={at === steps.length - 1 || blocked !== null} onClick={() => onGo(at + 1)}>
        <ChevronRight className="size-4" />
      </RailArrow>
    </nav>
  )
}

/**
 * An end of the rail. Built from the same parts as a section rather than from a
 * button, so the row reads as one control with the steps laid along it.
 */
function RailArrow({
  label,
  forward = false,
  disabled,
  onClick,
  children,
}: {
  label: string
  /** The way on, which is the one end of the rail that is an instruction. */
  forward?: boolean
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid shrink-0 place-items-center border-t-2 border-t-edge-strong px-2 transition-colors hover:bg-panel hover:text-bone disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
        forward && !disabled ? 'text-bone' : 'text-dim'
      }`}
    >
      {children}
    </button>
  )
}
