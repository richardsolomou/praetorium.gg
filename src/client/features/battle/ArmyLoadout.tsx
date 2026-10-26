import { useQuery } from '@tanstack/react-query'
import type { UnitState } from '../../../core/battle'
import type { Army } from '../../sides'
import { factionQuery, priceQuery } from '../../queries'
import { Loadout } from '../rosters/builder/Loadout'
import { normalisePicks } from '../rosters/rosterPicks'
import { DatasheetPanel } from '../rosters/builder/DatasheetPanel'
import { UnitPhoto } from '../rosters/builder/UnitPhoto'
import { useDetachmentRules } from '../rosters/builder/useDetachmentRules'
import { Problem } from '../../components/Problem'

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
  const { data: faction } = useQuery(factionQuery(built.catalogueId))
  const detachmentRules = useDetachmentRules(built.catalogueId, faction?.detachments, detachmentIds)

  return (
    <div data-army-loadout className="min-w-0 bg-sunken">
      {isError || (!isPending && (!priced || !matches)) ? (
        <Problem className="p-3 text-xs">This loadout could not be loaded. Try again shortly.</Problem>
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
            footer={matches ? <UnitPhoto entryId={selected!.entryId} name={selected!.name} /> : undefined}
            // The roster editor's datasheet, so a unit reads the same in battle as where it was built.
            reference={
              <DatasheetPanel
                catalogueId={catalogueId}
                entryId={unit.entryId ?? null}
                detachmentIds={detachmentIds}
                picks={picks}
                pickIndex={selected?.key ?? null}
                embedded
                hideSummary
                detachmentRules={detachmentRules}
              />
            }
          />
        </div>
      )}
    </div>
  )
}

const ignoreEdit = () => undefined
