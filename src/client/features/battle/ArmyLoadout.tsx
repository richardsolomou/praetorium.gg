import { useQuery } from '@tanstack/react-query'
import type { UnitState } from '../../../core/battle'
import type { Datasheet } from '../../../contracts/catalogue'
import type { Army } from '../../sides'
import { priceQuery } from '../../queries'
import { Loadout } from '../rosters/builder/Loadout'
import { normalisePicks } from '../rosters/rosterPicks'
import { AbilitySummary } from '../rosters/builder/DatasheetPanel'
import { ProfileRules } from '../rosters/ProfileRules'
import { referenceAbilities } from '../../datasheet'

export function ArmyLoadout({ army, unit }: { army: Army; unit: UnitState }) {
  const built = army.roster!.built!
  const picks = normalisePicks(built.picks ?? [])
  const detachmentIds = built.detachmentIds ?? []
  const {
    data: priced,
    isError,
    isPending,
  } = useQuery(priceQuery(built.catalogueId, detachmentIds, built.disposition, built.limit, picks, built.waivedRules))
  const selected = priced?.units[army.units.findIndex((candidate) => candidate.key === unit.key)]
  const matches = selected?.entryId === unit.entryId
  const catalogueId = selected ? (picks[selected.key]?.catalogueId ?? built.catalogueId) : built.catalogueId

  return (
    <div data-army-loadout className="mt-1 min-w-0 border border-edge bg-sunken">
      {isError || (!isPending && (!priced || !matches)) ? (
        <p role="alert" className="p-3 text-xs text-destructive">
          This loadout could not be loaded. Try again shortly.
        </p>
      ) : (
        <div className="min-w-0">
          <Loadout
            catalogueId={catalogueId}
            unit={matches ? selected! : null}
            loading={!priced}
            detachmentIds={detachmentIds}
            picks={picks}
            pickIndex={selected?.key ?? null}
            onChoose={ignoreEdit}
            onSpread={ignoreEdit}
            editable={false}
            embedded
            showOptions={false}
            reference={<ArmyAbilities />}
          />
        </div>
      )}
    </div>
  )
}

const ignoreEdit = () => undefined

function ArmyAbilities({ providedSheet }: { providedSheet?: Datasheet | null }) {
  if (!providedSheet) return null
  return (
    <div data-army-abilities className="space-y-4 border-t border-edge pt-4">
      <AbilitySummary
        abilities={referenceAbilities(providedSheet.abilities, providedSheet.attachments)}
        rules={providedSheet.keywordRules}
        unitName={providedSheet.name}
      />
      <ProfileRules profiles={providedSheet.profiles} rules={providedSheet.keywordRules} compact />
    </div>
  )
}
