import { cn } from '@/lib/utils'
import type { Command } from '../../../../core/battle'
import { dispositionTone } from '../../../components/rosterSetup'
import { formatList } from '../../../text'
import { type Side, sideName } from '../../../sides'
import { DispositionChip } from './chrome'

/**
 * The Force Disposition a side plays, as one row under its mission.
 *
 * An allied side whose armies brought different ones picks between them here; who
 * brought each is in its tooltip, because the row is for the choice, not the roster.
 */
export function SideDispositionChoice({
  side,
  nameDisposition,
  send,
}: {
  side: Side
  nameDisposition: (id: string | null | undefined) => { id: string; name: string } | null
  send: (command: Command) => void
}) {
  if (side.dispositionChoices.length < 2) {
    const played = nameDisposition(side.disposition)
    return played ? (
      <p className="flex flex-wrap items-center gap-2">
        <span className="eyebrow">Force Disposition</span>
        <DispositionChip disposition={played} />
      </p>
    ) : null
  }

  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="eyebrow float-left mr-2">
        Force Disposition<span className="sr-only"> for {sideName(side)}</span>
      </legend>
      {side.dispositionChoices.map((id) => {
        const chosen = side.disposition === id
        const named = nameDisposition(id)?.name ?? id
        const broughtBy = side.armies.filter((army) => army.roster?.built?.disposition === id).map((army) => army.playerName)
        return (
          <button
            key={id}
            type="button"
            aria-pressed={chosen}
            aria-label={`Play ${named} for ${sideName(side)}`}
            title={broughtBy.length ? `Brought by ${formatList(broughtBy)}` : undefined}
            className={cn('chip cursor-pointer transition-colors', dispositionTone(id, chosen), !chosen && 'opacity-70 hover:opacity-100')}
            onClick={() => send({ kind: 'set-side-disposition', side: side.index, disposition: id })}
          >
            {named}
          </button>
        )
      })}
    </fieldset>
  )
}
