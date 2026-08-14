import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BattleView, Command, Roster } from '../../core/battle'
import { savedRostersQuery } from '../queries'
import { errorMessage } from '../queryClient'
import { savedRosterPrice } from '../../server/functions'
import { Battlefield } from './Battlefield'

type Props = { view: BattleView; send: (command: Command) => void; pending: boolean; problem: string | null }

export function Setup({ view, send, pending, problem }: Props) {
  const you = view.players.find((player) => player.isViewer)!
  const opponent = view.players.find((player) => !player.isViewer)!
  const { data: saved = [] } = useQuery(savedRostersQuery())
  const [choosingRoster, setChoosingRoster] = useState(!you.roster)
  const ready = view.players.every((player) => player.roster)
  const attach = useMutation({
    mutationFn: async (savedRoster: (typeof saved)[number]) => {
      const priced = await savedRosterPrice({ data: { id: savedRoster.id } })
      if (!priced) throw new Error('That roster could not be loaded.')
      return { savedRoster, roster: battleRoster(savedRoster, priced) }
    },
    onSuccess: ({ roster }) => {
      send({ kind: 'attach-roster', roster })
      setChoosingRoster(false)
    },
  })

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <header className="border-b border-edge pb-4">
        <p className="eyebrow">Battle setup</p>
        <h1 className="mt-1 text-2xl">
          {you.name} versus {opponent.name}
        </h1>
        <p className="mt-2 text-sm text-dim">Choose the army you brought, then set up the battlefield and deploy.</p>
      </header>

      {choosingRoster ? (
        <section>
          <div className="flex items-end justify-between gap-3 border-b border-edge pb-2">
            <div>
              <p className="eyebrow">Your army</p>
              <h2 className="text-xl">Choose your roster</h2>
            </div>
            {you.roster ? (
              <Button variant="ghost" size="sm" onClick={() => setChoosingRoster(false)}>
                Keep current roster
              </Button>
            ) : null}
          </div>
          {saved.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {saved.map((roster) => (
                <Button
                  key={roster.id}
                  variant="outline"
                  className="h-auto justify-between rounded-none border-edge bg-panel p-4 text-left"
                  disabled={pending || attach.isPending}
                  onClick={() => attach.mutate(roster)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold uppercase">{roster.name}</span>
                    <span className="mt-1 block text-xs font-normal text-dim">{roster.picks.length} units</span>
                  </span>
                  <span className="chip shrink-0">{roster.limit} pts</span>
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-3 border border-edge bg-panel p-4 text-sm text-dim">You do not have a saved roster yet.</p>
          )}
          {attach.error ? <p className="mt-3 text-sm text-destructive">{errorMessage(attach.error)}</p> : null}
        </section>
      ) : (
        <section className="flex items-center justify-between gap-4 border border-edge bg-panel p-4">
          <div className="min-w-0">
            <p className="eyebrow">Your roster</p>
            <p className="truncate font-bold uppercase">{you.roster?.name}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setChoosingRoster(true)}>
            Change roster
          </Button>
        </section>
      )}

      <p className="text-sm text-dim">
        {opponent.roster ? `${opponent.name} is ready.` : `Waiting for ${opponent.name} to choose a roster.`}
      </p>

      {you.roster && !choosingRoster ? (
        <section className="space-y-5 border border-edge bg-panel p-4">
          <Battlefield view={view} send={send} pending={pending} />
        </section>
      ) : null}

      {you.roster && view.deploymentId ? (
        ready ? (
          <section className="border border-edge bg-panel p-4">
            <p className="eyebrow">Start the battle</p>
            <h2 className="mt-1 text-lg">Who has the first turn?</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {view.players.map((player) => (
                <Button key={player.id} disabled={pending} onClick={() => send({ kind: 'begin-battle', firstPlayerId: player.id })}>
                  {player.name}
                </Button>
              ))}
            </div>
          </section>
        ) : (
          <p className="border border-edge bg-panel p-4 text-sm text-dim">
            Waiting for {opponent.name} to choose a roster before starting.
          </p>
        )
      ) : null}

      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
    </main>
  )
}

function battleRoster(
  saved: Awaited<ReturnType<NonNullable<ReturnType<typeof savedRostersQuery>['queryFn']>>>[number],
  priced: NonNullable<Awaited<ReturnType<typeof savedRosterPrice>>>,
): Roster {
  return {
    name: saved.name,
    text: [
      `${priced.points} / ${saved.limit} pts`,
      ...priced.detachments.map(
        (detachment, index) => `${index ? 'Detachment' : 'Primary detachment'}: ${detachment.name} (${detachment.points ?? '?'} DP)`,
      ),
      '',
      ...priced.units.map((unit) => `${unit.name}${unit.size.resizable ? ` (${unit.size.models})` : ''} — ${unit.points}`),
    ].join('\n'),
    built: {
      catalogueId: saved.catalogueId,
      revision: priced.revision,
      limit: saved.limit,
      detachment: priced.detachment,
      detachments: priced.detachments,
      detachmentPointBudget: priced.detachmentPointBudget,
      disposition: priced.disposition,
      selections: priced.selections,
      units: priced.units.map((unit, index) => ({
        key: `${index}-${unit.entryId}`,
        name: unit.name,
        points: unit.points,
        models: unit.size.models,
      })),
    },
  }
}
