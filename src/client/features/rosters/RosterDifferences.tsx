import { ArrowLeftRight } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type NamedRosterDifferences, sameRoster } from '../../../core/rosterDifferences'
import { dispositionTone } from '../../components/rosterSetup'

type UnitChange = NamedRosterDifferences['added'][number]

/** The variant's own setup, which a changed part is drawn as, the way its base's row draws it. */
export type VariantSetup = {
  factionName?: string
  detachmentName: (id: string) => string | undefined
  disposition: { id: string; name: string } | null
}

const counted = ({ name, count }: UnitChange) => (count > 1 ? `${name} ×${count}` : name)
const total = (changes: readonly UnitChange[]) => changes.reduce((sum, change) => sum + change.count, 0)

// Whitespace between flex items does not render, so the spaces below only keep the text readable to assistive technology.
function Chip({
  sign,
  tone = '',
  children,
  ...props
}: { sign?: '+' | '−' | 'replaced'; tone?: string; children?: ReactNode } & Omit<ComponentProps<'span'>, 'children'>) {
  return (
    <span {...props} className={`chip max-w-full gap-1 whitespace-nowrap ${tone}`.trimEnd()}>
      {sign === 'replaced' ? (
        <>
          <ArrowLeftRight className="size-3 text-info" aria-hidden />
          <span className="sr-only">Replaced by</span>
        </>
      ) : sign ? (
        <span className={sign === '+' ? 'text-achieved' : 'text-destructive'}>{sign}</span>
      ) : null}
      {sign ? ' ' : null}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

/**
 * Detachment chips: a changed set shows what it gained and lost, while a variant that
 * kept none of its base's shows only its replacements, since the base's row above it
 * already names what they replaced.
 */
function detachmentChips(differences: NamedRosterDifferences, setup: VariantSetup) {
  const { added, removed, replaced } = differences.detachments
  const named = (id: string) => setup.detachmentName(id) ?? id
  if (replaced && added.length)
    return added.map((id) => (
      <Chip key={`detachment:${id}`} sign="replaced">
        {named(id)}
      </Chip>
    ))
  const chips = [
    ...added.map((id) => (
      <Chip key={`detachment:+${id}`} sign="+">
        {named(id)}
      </Chip>
    )),
    ...removed.map((id) => (
      <Chip key={`detachment:−${id}`} sign="−">
        {named(id)}
      </Chip>
    )),
  ]
  return chips.length ? chips : [<Chip key="detachment:borrowed">Borrowed detachment changed</Chip>]
}

/**
 * How many units a variant added or removed, naming them on hover. The names are
 * also in the chip's accessible text, because a chip inside a library row's link
 * cannot take focus of its own; a touch screen has no hover, so the editor's menu
 * lists them in full.
 */
function UnitCount({ sign, changes }: { sign: '+' | '−'; changes: readonly UnitChange[] }) {
  const units = total(changes)
  return (
    <Tooltip>
      <TooltipTrigger render={<Chip sign={sign} />}>
        {`${units} ${units === 1 ? 'unit' : 'units'}`}
        <span className="sr-only">: {changes.map(counted).join(', ')}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="block">
        <ul className="space-y-0.5">
          {changes.map((change) => (
            <li key={change.name}>{counted(change)}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * A variant's changes from its base as chips: detachments, then its disposition in
 * the colour every disposition chip has, then how many units it added and removed,
 * then changed loadouts. The size is left out, because the points beside it already
 * say it.
 */
export function RosterDifferenceChips({ differences, setup }: { differences: NamedRosterDifferences; setup: VariantSetup }) {
  const changed = new Set(differences.setup)
  const chips = [
    changed.has('faction') && setup.factionName ? <Chip key="faction">{setup.factionName}</Chip> : null,
    ...(changed.has('detachment') ? detachmentChips(differences, setup) : []),
    changed.has('disposition') && setup.disposition ? (
      <Chip key="disposition" tone={dispositionTone(setup.disposition.id)}>
        {setup.disposition.name}
      </Chip>
    ) : null,
    changed.has('rules') ? <Chip key="rules">Rules changed</Chip> : null,
    differences.added.length ? <UnitCount key="+" sign="+" changes={differences.added} /> : null,
    differences.removed.length ? <UnitCount key="−" sign="−" changes={differences.removed} /> : null,
    differences.loadouts ? (
      <Chip key="loadouts">{`${differences.loadouts} ${differences.loadouts === 1 ? 'loadout' : 'loadouts'}`}</Chip>
    ) : null,
  ].filter(Boolean)
  return (
    <span data-slot="roster-differences" className="flex min-w-0 flex-wrap items-center gap-1">
      {chips.length ? chips.flatMap((chip, index) => (index ? [' ', chip] : [chip])) : null}
      {sameRoster(differences) ? <span className="text-xs text-dim">No changes</span> : null}
    </span>
  )
}

/** Every datasheet added and removed, which the chips only count. */
export function RosterDifferenceList({ differences }: { differences: NamedRosterDifferences }) {
  return (
    <div className="space-y-3 text-xs">
      {differences.added.length ? <UnitList title="Added" sign="+" changes={differences.added} /> : null}
      {differences.removed.length ? <UnitList title="Removed" sign="−" changes={differences.removed} /> : null}
    </div>
  )
}

function UnitList({ title, sign, changes }: { title: string; sign: '+' | '−'; changes: readonly UnitChange[] }) {
  return (
    <section className="space-y-1">
      <h3 className="eyebrow">{title}</h3>
      <ul className="space-y-0.5">
        {changes.map((change) => (
          <li key={change.name} className="flex gap-1.5">
            <span aria-hidden className={sign === '+' ? 'text-achieved' : 'text-destructive'}>
              {sign}
            </span>
            {counted(change)}
          </li>
        ))}
      </ul>
    </section>
  )
}
