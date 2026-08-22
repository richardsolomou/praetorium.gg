import { Button } from '@/components/ui/button'
import { type Side, sideName } from '../../sides'
import { HEADING, tint } from '../battle/tints'

export function SetupSideChoice({
  label,
  hint,
  sides,
  chosen,
  onChoose,
}: {
  label: string
  hint: string
  sides: Side[]
  chosen: number | null
  onChoose: (index: number) => void
}) {
  return (
    <fieldset>
      <legend className={HEADING}>{label}</legend>
      <p className="mt-0.5 text-xs text-dim">{hint}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {sides.map((side) => (
          <Button
            key={side.index}
            variant="outline"
            aria-pressed={side.index === chosen}
            className={`h-auto justify-start border-t-2 px-3 py-2 text-left ${tint(side.index).edge} ${side.index === chosen ? 'bg-parchment/10 ring-2 ring-parchment' : ''}`}
            onClick={() => onChoose(side.index)}
          >
            <span className="min-w-0">
              <span className={`block truncate text-sm font-bold uppercase ${tint(side.index).text}`}>{sideName(side)}</span>
              <span className="block truncate text-[0.625rem] font-normal text-dim">
                {side.armies.map((army) => army.roster?.name ?? 'No army').join(' · ')}
              </span>
            </span>
          </Button>
        ))}
      </div>
    </fieldset>
  )
}
