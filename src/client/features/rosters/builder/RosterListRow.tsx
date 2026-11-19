import { Crown } from 'lucide-react'
import { Fragment } from 'react'

/** One datasheet on a list line: an attached unit's line names its bodyguard first, then whoever joined it. */
export type ListMember = {
  index: number
  name: string
  models: number
  warlord?: boolean
  /** Enhancements and upgrades, which change what the unit costs and does. */
  specials: string[]
}

/**
 * A unit as an exported list prints it: how many models, the name, what it was given and what it costs, with an
 * attached unit and the transport it starts in on the same line. The row opens its first datasheet's loadout, and an
 * attached unit's other names open theirs.
 */
export function RosterListRow({
  members,
  points,
  ridesIn,
  selected,
  onSelect,
}: {
  members: ListMember[]
  points: number
  ridesIn?: string
  selected: number | null
  onSelect?: (index: number) => void
}) {
  const current = members.some((member) => member.index === selected)
  const host = members[0]!
  // Only an attached unit's names need their own targets; a lone unit's name is the row's.
  const named = onSelect && members.length > 1 ? onSelect : undefined
  return (
    <div
      data-roster-row={host.name}
      data-gate={current ? 'current' : undefined}
      className={`relative flex min-w-0 items-baseline gap-3 px-2.5 py-1.5 text-sm transition-colors ${
        current ? 'bg-edge/70 shadow-[inset_2px_0_0_var(--color-parchment)]' : onSelect ? 'hover:bg-edge/50' : ''
      }`}
    >
      {onSelect ? (
        <button
          type="button"
          className="absolute inset-0 cursor-pointer"
          aria-label={host.name}
          aria-pressed={host.index === selected}
          onClick={() => onSelect(host.index)}
        />
      ) : null}
      <span className="pointer-events-none relative min-w-0 flex-1 [&_button]:pointer-events-auto">
        {members.map((member, at) => (
          <Fragment key={member.index}>
            {at ? <span className="text-faint"> + </span> : null}
            <Member member={member} selected={member.index === selected} onSelect={named} />
          </Fragment>
        ))}
        {ridesIn ? <span className="text-xs text-dim"> · in {ridesIn}</span> : null}
      </span>
      <span className="readout pointer-events-none relative shrink-0 text-xs text-dim">{points}</span>
    </div>
  )
}

function Member({ member, selected, onSelect }: { member: ListMember; selected: boolean; onSelect?: (index: number) => void }) {
  const label = (
    <>
      {member.warlord ? <Crown className="mr-1 inline size-3 -translate-y-px fill-current text-info" aria-label="Warlord" /> : null}
      {member.models > 1 ? <span className="readout mr-1 text-dim">{member.models}</span> : null}
      {member.name}
    </>
  )
  return (
    <>
      {onSelect ? (
        // Plain text rather than the shared button, which lays its content out as a flex box and lifts it off the line.
        <button
          type="button"
          className={`cursor-pointer text-left hover:text-parchment ${selected ? 'text-parchment' : 'text-bone'}`}
          aria-pressed={selected}
          onClick={() => onSelect(member.index)}
        >
          {label}
        </button>
      ) : (
        <span className={selected ? 'text-parchment' : undefined}>{label}</span>
      )}
      {member.specials.length ? <span className="text-xs text-achieved"> ({member.specials.join(', ')})</span> : null}
    </>
  )
}
