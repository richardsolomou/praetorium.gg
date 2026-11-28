import type { RuleSummaryInline } from '../contracts/rules'
import type { VsDataUnit } from './vsData'

export type Line = RuleSummaryInline[]
type Run = string | RuleSummaryInline

/** A line of runs, each string plain; adjacent plain runs join, so a line reads the same however it was put together. */
export const line = (...runs: readonly (Run | readonly Run[])[]): Line =>
  runs.flat().reduce<Line>((joined, run) => {
    const next = typeof run === 'string' ? { text: run } : run
    const last = joined.at(-1)
    if (!next.text) return joined
    if (last && !last.bold && !next.bold && !last.link && !next.link && !last.ability && !next.ability) last.text += next.text
    else joined.push({ ...next })
    return joined
  }, [])
/** A keyword or rule name, bold as BSData prints them. */
export const bold = (text: string): RuleSummaryInline => ({ text, bold: true })

const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`)
/** Items as one run of a sentence, joined by `comma` and `last`. */
export const listed = <T>(items: readonly T[], last = 'or', comma = ','): (T | string)[] =>
  items.flatMap((item, at) => [
    ...(at === 0 ? [] : [at < items.length - 1 ? `${comma} ` : comma === ',' ? ` ${last} ` : `${comma} ${last} `]),
    item,
  ])
export const counted = (items: readonly (readonly [string, number])[]) =>
  items.map(([name, count]) => (count === 1 ? name : `${count} × ${name}`))

/**
 * Each model line of a unit, its count beside the model's name as VS Data writes it, singular or plural ("5–10 × Immortal",
 * "4–9 × Deathwing Terminators"), since no rule spells every name's plural; then the unit's sizes where its lines do not
 * add up to them, as a Brotherhood Terminator Squad's optional Ancient takes the place of one of its Terminators, or where
 * it takes only some sizes between its smallest and largest, as Boyz take 10 or 20 models.
 */
export function unitComposition(
  unit: Pick<VsDataUnit, 'sizes' | 'defaultModels'> & { models: readonly Pick<VsDataUnit['models'][number], 'name' | 'min' | 'max'>[] },
): Line[] {
  const lines = unit.models.map((model) => line(`${range(model.min, model.max)} × ${model.name.replace(/[.,;:]+$/, '')}`))
  if (!unit.sizes.length) return lines
  const sizes = [...new Set(unit.sizes)].toSorted((left, right) => left - right)
  const [fewest, most] = [sizes[0]!, sizes.at(-1)!]
  // A unit fielded at 10 or 20 models only says so, or its lines would read as allowing any size between.
  const gaps = sizes.length !== most - fewest + 1
  const low = unit.models.reduce((total, model) => total + model.min, 0)
  const high = unit.models.reduce((total, model) => total + model.max, 0)
  const size = gaps ? listed(sizes.map(String)).join('') : range(fewest, most)
  const sized = low === fewest && high === most && !gaps ? lines : [...lines, line(`${size} models in all`)]
  return unit.defaultModels ? [...sized, line('It starts as ', listed(counted(unit.defaultModels), 'and'), '.')] : sized
}

/** `unitComposition` as plain lines, which is how agents, the reference index and the canonical catalogue print it. */
export const compositionLines = (unit: Parameters<typeof unitComposition>[0]) =>
  unitComposition(unit).map((runs) => runs.map((run) => run.text).join(''))
