import { useQuery } from '@tanstack/react-query'
import { Crosshair } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import { combatantDatasheetsQuery } from '../../queries'
import type { Army, Side } from '../../sides'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'
import { armyThreats, survivingUnits, threatReach } from './armyThreats'
import { formationLabel } from './setup/chrome'
import { tint } from './battleTints'

/** The opponent's surviving units by how far they reach, so a player need not open each datasheet in turn. */
export function ArmyThreats({ army, side }: { army: Army; side: Side }) {
  const [open, setOpen] = useState(false)
  const built = army.roster?.built
  const { rows, request } = survivingUnits(army.units, built?.picks)
  const query = combatantDatasheetsQuery({ catalogueId: built?.catalogueId ?? '', detachmentIds: built?.detachmentIds ?? [], ...request })
  const reads = Boolean(built && query.enabled)
  const { data, isError, isPending } = useQuery({ ...query, enabled: open && reads })
  if (!rows.length) return null
  const threats = armyThreats(rows, data)
  const loading = reads && isPending

  return (
    <>
      <Button
        variant="secondary"
        size="xs"
        onClick={() => {
          setOpen(true)
          posthog.capture('battle_threats_opened')
        }}
        aria-label={`Threats from ${army.playerName}'s army`}
      >
        <Crosshair aria-hidden /> Threats
      </Button>
      <BattlePromptDialog
        open={open}
        onOpenChange={setOpen}
        minimizedLabel={`${army.playerName} · Threats`}
        resumeLabel="Return to threats"
      >
        <BattleDialogContent data-army-threats size="md" className={tint(side.index).border}>
          <DialogHeader>
            <DialogTitle>Threats</DialogTitle>
            <DialogDescription>
              {army.playerName}'s surviving units, sorted by Move plus their longest ranged weapon. Advance, charge and abilities are not
              added.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {isError ? <Problem className="mb-2 text-xs">The datasheets could not be loaded. Try again shortly.</Problem> : null}
            <table className="w-full border-collapse rounded-lg border border-edge bg-sunken text-xs">
              <thead>
                <tr className="border-b border-edge text-left text-2xs tracking-wide text-faint uppercase">
                  <th scope="col" className="px-2 py-1.5 font-normal">
                    Unit
                  </th>
                  <th scope="col" className="w-14 px-2 py-1.5 text-right font-normal">
                    Move
                  </th>
                  <th scope="col" className="w-14 px-2 py-1.5 text-right font-normal">
                    Range
                  </th>
                  <th scope="col" className="w-14 px-2 py-1.5 text-right font-semibold">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {threats.map((threat) => (
                  <tr key={threat.key} data-threat={threat.name} className="border-b border-edge last:border-0">
                    <th scope="row" className="px-2 py-1.5 text-left font-normal">
                      <span className="mr-1.5">{threat.name}</span>
                      {/* Off the table it reaches nothing until it arrives, which is worth seeing beside the number. */}
                      {threat.formation === 'battlefield' ? null : <span className="chip">{formationLabel(threat.formation)}</span>}
                    </th>
                    <Inches value={threat.move} loading={loading} />
                    <Inches value={threat.range} loading={loading} />
                    <Inches value={threatReach(threat)} loading={loading} strong />
                  </tr>
                ))}
              </tbody>
            </table>
          </DialogBody>
        </BattleDialogContent>
      </BattlePromptDialog>
    </>
  )
}

function Inches({ value, loading, strong = false }: { value: number | null; loading: boolean; strong?: boolean }) {
  return (
    <td className={`readout px-2 py-1.5 text-right ${strong ? 'font-semibold' : 'text-dim'}`}>
      {value === null ? (loading ? '…' : '–') : `${value}"`}
    </td>
  )
}
