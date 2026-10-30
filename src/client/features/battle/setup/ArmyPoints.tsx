import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ARMY_POINTS_ERROR, validArmyPoints } from '../../../../core/battle'
import { capitalised } from '../../../../core/text'
import { sideName, type Side } from '../../../sides'

const textFor = (chosen: number[] | undefined, side: number) => (chosen?.[side] === undefined ? '' : String(chosen[side]))

/**
 * What each army on a side may spend, typed per side: 1,750 against 800 each, say.
 *
 * Most tables play an even split, which the battle size already names, so the boxes stay folded behind one link until
 * someone asks for them or the table has set its own numbers. A box left empty plays an even share of the battle size,
 * which its placeholder shows. The battle keeps both numbers as one pair, so either box sends both as they read on
 * screen.
 */
export function ArmyPoints({
  sides,
  defaults,
  chosen,
  disabled,
  onChange,
}: {
  sides: Side[]
  /** Each side's even share of the battle size, by side index. */
  defaults: number[]
  /** The table's own numbers, by side index, when it set them. */
  chosen: number[] | undefined
  disabled: boolean
  onChange: (armyPoints: number[] | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [texts, setTexts] = useState(() => [0, 1].map((side) => textFor(chosen, side)))
  // Another device's answer replaces only the box whose number it changed, leaving one being typed in alone.
  const [seen, setSeen] = useState(chosen)
  if (JSON.stringify(seen) !== JSON.stringify(chosen)) {
    setSeen(chosen)
    setTexts((current) => current.map((text, side) => (seen?.[side] === chosen?.[side] ? text : textFor(chosen, side))))
  }
  const points = texts.map((text, side) => (text.trim() ? Number(text) : defaults[side]!))
  const invalid = (value: number) => !validArmyPoints(value)
  const commit = () => {
    if (points.some(invalid)) return
    const next = points.every((value, side) => value === defaults[side]) ? null : points
    if (JSON.stringify(next) !== JSON.stringify(chosen ?? null)) onChange(next)
  }

  if (!open && !chosen)
    return (
      <div className="-mt-2 sm:col-span-2">
        <Button variant="link" size="sm" className="px-0 text-info" disabled={disabled} onClick={() => setOpen(true)}>
          Set points per army
        </Button>
      </div>
    )

  return (
    <fieldset className="sm:col-span-2">
      <legend className="eyebrow">Points per army</legend>
      <div className="mt-1 grid gap-3 sm:grid-cols-2">
        {sides.map((side) => {
          const id = `army-points-${side.index}`
          const error = invalid(points[side.index]!) ? `${capitalised(ARMY_POINTS_ERROR)}.` : null
          return (
            <div key={side.index} className="min-w-0 space-y-1">
              <Label htmlFor={id} className="truncate text-xs text-dim">
                {sideName(side)}
                {side.armies.length > 1 ? ', each' : ''}
              </Label>
              <Input
                id={id}
                inputMode="numeric"
                autoComplete="off"
                placeholder={String(defaults[side.index])}
                value={texts[side.index]}
                disabled={disabled}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${id}-error` : undefined}
                className="h-11 text-base"
                onChange={(event) => setTexts((current) => current.map((text, at) => (at === side.index ? event.target.value : text)))}
                onBlur={commit}
                onKeyDown={(event) => event.key === 'Enter' && commit()}
              />
              {error ? (
                <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
      <Button
        variant="link"
        size="sm"
        className="mt-1 px-0 text-info"
        disabled={disabled}
        // Kept from taking focus, so a box being typed in is not sent on its way out just before this clears it.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setOpen(false)
          setTexts(['', ''])
          if (chosen) onChange(null)
        }}
      >
        Use an even split
      </Button>
    </fieldset>
  )
}
