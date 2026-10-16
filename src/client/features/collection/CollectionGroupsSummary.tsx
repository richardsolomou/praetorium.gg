import type { CollectionModelGroup } from '../../../core/collection'

const STATES = { fixed: 'Fixed', unbuilt: 'Unbuilt', interchangeable: 'Interchangeable' }
export function CollectionGroupsSummary({
  groups,
  datasheets,
}: {
  groups?: CollectionModelGroup[]
  datasheets: { id: string; name: string }[]
}) {
  if (!groups) return null
  const names = new Map(datasheets.map((sheet) => [sheet.id, sheet.name]))
  return (
    <p className="ph-no-capture text-xs break-words text-dim">
      {groups
        .map(
          (group) =>
            `${group.models} ${STATES[group.state].toLowerCase()}: ${group.builds.map((build) => `${names.get(build.entryId) ?? 'Datasheet from earlier rules'}${build.equipment ? ` (${build.equipment})` : ''}`).join(' or ')}`,
        )
        .join(' · ')}
    </p>
  )
}
