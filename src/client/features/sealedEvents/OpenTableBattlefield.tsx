import { eventTableSides } from '../../../core/sealedEvent'
import type { SealedEvent } from './sealedEvent'
import { TableBattlefield } from './TableBattlefield'

/**
 * The battlefield of an event without Swiss pairings, once its lists are out. Only an event with exactly two sides has
 * one table to set it for.
 */
export function OpenTableBattlefield({
  sealedEvent,
  token,
  organizes,
  battles,
  noun,
  className,
}: {
  sealedEvent: Pick<SealedEvent, 'eventToken' | 'battlefields' | 'format' | 'entries'>
  token: string
  organizes: boolean
  battles: readonly { status: string }[]
  noun: string
  className?: string
}) {
  const sealed = sealedEvent.entries.filter((entry) => entry.status === 'accepted' && entry.submitted)
  if (!eventTableSides(sealedEvent.format, sealed)) return null
  const canChange = organizes && battles.every((battle) => battle.status === 'setup')
  const set = sealedEvent.battlefields.length > 0
  if (!set && !canChange) return null
  return (
    <div data-table-battlefield className={`flex flex-wrap items-center justify-between gap-2 ${className ?? ''}`}>
      <p className="min-w-0 flex-1 basis-48 text-sm text-dim">
        {set ? `This ${noun}’s battlefield is set.` : `Set this ${noun}’s battlefield so the players can prepare.`}
      </p>
      <TableBattlefield sealedEvent={sealedEvent} token={token} round={0} table={0} canChange={canChange} label="Battlefield" />
    </div>
  )
}
