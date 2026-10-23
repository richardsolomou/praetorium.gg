import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { asSentence } from '../../battle/useCommand'
import type { EmbarkTransport } from './embarkModel'

type Props = {
  unitName: string
  /** The bodyguard a character starts with, which the choice is kept on. */
  joined?: string
  transports: readonly EmbarkTransport[]
  /** While the list is being priced, the choices are shown but cannot be pressed. */
  pending: boolean
  onEmbark: (transportPickIndex: number | undefined) => void
}

/** Which of the roster's transports this unit starts the battle in, as battle setup will first place it. */
export function UnitEmbark({ unitName, joined, transports, pending, onEmbark }: Props) {
  const reasonId = useId()
  const chosen = transports.find((transport) => transport.chosen)
  return (
    <section className="space-y-1.5 border-b border-edge pb-3" aria-label="Starts embarked">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="eyebrow">Starts embarked</p>
        <p className="text-3xs text-dim">{chosen ? `In ${chosen.name}` : 'On the battlefield'}</p>
      </div>
      {joined ? <p className="text-3xs text-dim">Embarks together with {joined}.</p> : null}
      {transports.map((transport, index) => (
        <div key={transport.pickIndex} className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-sunken px-2 py-1.5">
          <div className="min-w-0">
            <p className="text-xs font-semibold break-words text-bone">{transport.name}</p>
            <p className="text-3xs text-dim">{transport.aboard ?? 'Model capacity unavailable'}</p>
            {transport.refusal && !transport.chosen ? (
              <p id={`${reasonId}-${index}`} className="text-3xs text-discarded">
                {asSentence(transport.refusal)}
              </p>
            ) : null}
          </div>
          <Button
            variant={transport.chosen ? 'secondary' : 'outline'}
            size="xs"
            disabled={pending || (!transport.chosen && transport.refusal !== null)}
            aria-describedby={transport.refusal && !transport.chosen ? `${reasonId}-${index}` : undefined}
            aria-label={`${transport.chosen ? 'Disembark' : 'Embark'} ${unitName} ${transport.chosen ? 'from' : 'in'} ${transport.name}`}
            onClick={() => onEmbark(transport.chosen ? undefined : transport.pickIndex)}
          >
            {transport.chosen ? 'Remove' : 'Embark'}
          </Button>
        </div>
      ))}
      <p className="text-3xs text-dim">Battle setup starts it here; you can still change it there.</p>
    </section>
  )
}
