import { useMutation, useQuery } from '@tanstack/react-query'
import { Map as MapIcon, Shuffle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import { setTableBattlefield, tableBattlefields } from '../../functions'
import { useStartBattle } from '../battles/useStartBattle'
import { deploymentsQuery, terrainReferencesQuery } from '../../queries'
import { TerrainBoard } from '../reference/missions/TerrainBoard'
import { useSealedEventRefresh, type SealedEvent } from './sealedEvent'

type Props = {
  sealedEvent: Pick<SealedEvent, 'eventToken' | 'battlefields'>
  token: string
  round: number
  table: number
  /** Whether this viewer runs the event and the table's battle has yet to start. */
  canChange: boolean
  label: string
}

/** A table's battlefield: what everyone sees ahead of the game, and where the organizer picks or rolls it. */
export function TableBattlefield({ sealedEvent, token, round, table, canChange, label }: Props) {
  const [open, setOpen] = useState(false)
  const { defaultMissionPackId: missionPackId } = useStartBattle()
  const refresh = useSealedEventRefresh(token)
  const current = sealedEvent.battlefields.find((candidate) => candidate.round === round && candidate.table === table)
  const deployments = useQuery({ ...deploymentsQuery(), enabled: Boolean(current) || open })
  const available = useQuery({
    queryKey: ['table-battlefields', token, round, table],
    enabled: open,
    queryFn: async () =>
      tableBattlefields({ data: { token, eventToken: sealedEvent.eventToken, round, table, missionPackId: await missionPackId() } }),
  })
  const references = useQuery({
    ...terrainReferencesQuery(available.data?.matchupIds ?? []),
    enabled: Boolean(available.data?.matchupIds.length),
  })
  const set = useMutation({
    mutationFn: async (battlefield: { patternId: string; terrainLayoutId: string } | 'roll' | null) =>
      setTableBattlefield({
        data: { token, eventToken: sealedEvent.eventToken, round, table, missionPackId: await missionPackId(), battlefield },
      }),
    onSuccess: refresh,
  })
  if (!current && !canChange) return null
  const name = deployments.data?.find((pattern) => pattern.id === current?.patternId)?.name
  const shown = (available.data?.options ?? []).filter((option) => canChange || option.terrainLayoutId === current?.terrainLayoutId)
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        aria-label={`${label}: ${current ? (name ?? 'set') : 'not set'}`}
        onClick={() => setOpen(true)}
      >
        <MapIcon /> {current ? (name ?? 'Battlefield') : 'Set battlefield'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {canChange
                ? 'Players see this ahead of the game and can’t change it. You can change it until the battle starts.'
                : 'The organizer set this battlefield, so you can prepare for it.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {canChange ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={set.isPending || !available.data?.options.length}
                  onClick={() => set.mutate('roll')}
                >
                  <Shuffle /> Roll
                </Button>
                {current ? (
                  <Button variant="ghost" size="sm" disabled={set.isPending} onClick={() => set.mutate(null)}>
                    Let the players choose
                  </Button>
                ) : null}
              </div>
            ) : null}
            {set.error ? <Problem error={set.error} /> : null}
            {available.isError ? <Problem>Battlefields are unavailable right now. Try again shortly.</Problem> : null}
            {available.data && !available.data.options.length ? (
              <p className="mt-3 text-sm text-dim">
                These armies don’t name a pair of battlefield layouts, so the players choose at the table.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              {shown.map((option) => {
                const layout = references.data?.layouts.find((candidate) => candidate.id === option.terrainLayoutId)
                const deployment = deployments.data?.find((pattern) => pattern.id === option.patternId)
                const selected = current?.terrainLayoutId === option.terrainLayoutId
                return layout && deployment ? (
                  <article key={option.terrainLayoutId} className="flex flex-col border bg-panel p-3">
                    <p className="truncate text-sm text-dim">{deployment.name}</p>
                    <TerrainBoard
                      layout={layout}
                      deployment={deployment}
                      templates={references.data?.templates ?? []}
                      className="mt-2 w-full"
                      ariaLabel={`${deployment.name} battlefield with ${layout.name}`}
                    />
                    {canChange ? (
                      <Button
                        variant={selected ? 'secondary' : 'outline'}
                        className="mt-3 w-full"
                        disabled={set.isPending || selected}
                        onClick={() => set.mutate(option)}
                      >
                        {selected ? 'Selected' : 'Select'}
                      </Button>
                    ) : null}
                  </article>
                ) : null
              })}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
