import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { UnitState } from '../../../core/battle'
import type { Army } from '../../sides'
import { factionQuery, setupPriceQuery } from '../../queries'
import { Loadout } from '../rosters/builder/Loadout'
import { normalisePicks } from '../rosters/rosterPicks'
import { DatasheetPanel } from '../rosters/builder/DatasheetPanel'
import { UnitPhoto } from '../rosters/builder/UnitPhoto'
import { useDetachmentRules } from '../rosters/builder/useDetachmentRules'
import { FieldedUnit } from '../rosters/FieldedUnit'
import type { StandingWargear } from '../rosters/builder/LoadoutControls'
import { sameWargear } from '../../../core/wargearNames'

/** `seek` is the model line a player pressed, renewed on every press so pressing it again scrolls back to it. */
export function ArmyLoadout({ army, unit, seek }: { army: Army; unit: UnitState; seek?: { line: number; press: number } }) {
  const built = army.roster!.built!
  const picks = normalisePicks(built.picks ?? [])
  const detachmentIds = built.detachmentIds ?? []
  const fielded = { at: army.roster!.fieldedAt }
  const { data: priced, isError, isPending } = useQuery(setupPriceQuery({ ...built, detachmentIds, fielded }, picks))
  const selected = priced?.units[army.units.findIndex((candidate) => candidate.key === unit.key)]
  const matches = selected?.entryId === unit.entryId
  const catalogueId = selected ? (picks[selected.key]?.catalogueId ?? built.catalogueId) : built.catalogueId
  const { data: faction } = useQuery(factionQuery(built.catalogueId))
  const detachmentRules = useDetachmentRules(built.catalogueId, faction?.detachments, detachmentIds)
  const pane = useRef<HTMLDivElement>(null)
  // The datasheet can arrive after the press, so the row is waited for rather than looked for once.
  useEffect(() => {
    const root = pane.current
    if (!seek || !root) return
    const reach = () => {
      const row = root.querySelector('[data-sought]')
      row?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      return Boolean(row)
    }
    if (reach()) return
    const watch = new MutationObserver(() => reach() && watch.disconnect())
    watch.observe(root, { childList: true, subtree: true })
    return () => watch.disconnect()
  }, [seek])

  return (
    <div ref={pane} data-army-loadout className="min-w-0 bg-sunken">
      {isError || (!isPending && (!priced || !matches)) ? (
        <FieldedUnit unit={unit} failed={isError} />
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
            fielded={fielded}
            // The list's key, so a pick reads the same here, on its roster page and in the builder.
            battleChoices={army.rosterId ? `roster:${army.rosterId}` : `battle:${army.playerId}:${army.roster!.fieldedAt}`}
            standing={standingWargear(unit, seek?.line)}
            unavailable={<FieldedUnit unit={unit} />}
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
                detachmentRules={detachmentRules}
                fielded={fielded}
              />
            }
          />
        </div>
      )}
    </div>
  )
}

const ignoreEdit = () => undefined

/**
 * A row is gone when some piece it carries is held only by fallen models, and sought when it carries what
 * only the pressed line holds, or, for a line holding nothing of its own, anything that line holds.
 */
function standingWargear(unit: UnitState, sought?: number): StandingWargear | undefined {
  const lines = unit.modelLines
  const standing = unit.lines
  if (!lines || !standing) return undefined
  const holders = (piece: string) => lines.flatMap((line, at) => (line.wargear.some((held) => sameWargear(held.name, piece)) ? [at] : []))
  const pressed = sought === undefined ? [] : (lines[sought]?.wargear ?? []).map((piece) => piece.name)
  const own = pressed.filter((piece) => holders(piece).length === 1)
  const marks = own.length ? own : pressed
  return {
    fallen: (carries) =>
      lines.some((line) =>
        line.wargear.some((piece) => carries(piece.name) && holders(piece.name).every((at) => standing[at]!.alive === 0)),
      ),
    sought: (carries) => marks.some(carries),
  }
}
