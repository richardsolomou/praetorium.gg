import type { Datasheet } from './datasheet'
import { datasheetProfilesByKind } from './datasheetStructure'

type ReachMember = { sheet: Pick<Datasheet, 'profiles'>; companions?: readonly { sheet: Pick<Datasheet, 'profiles'> }[] }

const members = (unit: ReachMember) => [unit, ...(unit.companions ?? [])]

/** The distance every model can move together, including slower attachments. */
export const unitMove = (unit: ReachMember) =>
  Math.min(
    ...members(unit).flatMap((member) => {
      const profiles = datasheetProfilesByKind(member.sheet).unit
      return profiles.length
        ? profiles.map((profile) => Number.parseInt(profile.values.find((value) => value.kind === 'movement')?.value ?? '', 10) || 0)
        : [0]
    }),
  )

/** The longest range any ranged weapon in the unit or its attachments prints; null when none prints a number. */
export function unitRange(unit: ReachMember): number | null {
  const ranges = members(unit).flatMap((member) =>
    datasheetProfilesByKind(member.sheet).ranged.flatMap((profile) => {
      const range = Number.parseInt(profile.values.find((value) => value.kind === 'range')?.value ?? '', 10)
      return profile.count !== 0 && Number.isFinite(range) ? [range] : []
    }),
  )
  return ranges.length ? Math.max(...ranges) : null
}
