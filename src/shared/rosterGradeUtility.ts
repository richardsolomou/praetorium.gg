import type { UnitGeneration } from '../core/rosterGrades'

const normalText = (text: string) =>
  text
    .normalize('NFKC')
    .replaceAll(/\*\*|\^\^|<[^>]*>/g, '')
    .replaceAll(/\s+/g, ' ')

/** Recognised movement permissions describe options, not guaranteed extra distance. */
export function movementToolsFrom(description: string): string[] {
  const text = normalText(description)
  const tools: string[] = []
  if (/^This unit is eligible to declare a charge in a turn in which it Advanced\.$/iu.test(text.trim())) tools.push('Advance and charge')
  if (
    /opponent['’]s Shooting phase.*if a model in this unit was destroyed by those attacks, this unit can make a surge move of up to D6["″]/iu.test(
      text,
    )
  )
    tools.push('Up to D6″ surge after enemy shooting destroys a model')
  return tools
}

/** Recognised spawning conditions stay separate from the calibrated measures of starting units. */
export function unitGenerationFrom(description: string): UnitGeneration[] {
  const text = normalText(description)
  const unit = /add one new ([\p{L}\p{N} '\u2019-]+?) unit to your army/iu.exec(text)?.[1]
  if (!unit) return []
  if (/Once per turn, in your Shooting phase/iu.test(text) && /instead of making any attacks with its ranged weapons/iu.test(text))
    return [{ unit, trigger: 'shooting', shared: /one unit with this ability can use it/iu.test(text) }]
  if (/Each time .+? model is destroyed by an attack made with/iu.test(text)) return [{ unit, trigger: 'kill', shared: false }]
  return []
}
