import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BattleView, Command, Roster } from '../../core/battle'
import { GAME_SIZES, isKotcLimit, UNIT_FORMATIONS } from '../../core/battle'
import { battleQuery, battlesQuery, gameReferencesQuery, savedRostersQuery } from '../queries'
import { errorMessage } from '../queryClient'
import { deleteBattle, savedRosterPrice } from '../../server/functions'
import { Battlefield } from './Battlefield'
import { Prep } from './Prep'

type Props = {
  view: BattleView
  mission: { id: string; name: string; deploymentIds: string[] } | null
  send: (command: Command) => void
  pending: boolean
  problem: string | null
}

export function Setup({ view, mission, send, pending, problem }: Props) {
  const you = view.players.find((player) => player.isViewer)!
  const opponents = view.players.filter((player) => player.side !== you.side)
  const { data: saved = [] } = useQuery(savedRostersQuery())
  const teammates = view.players.filter((player) => player.side === you.side).length
  const rosterLimit = view.settings.limit === null ? null : view.settings.limit / teammates
  const eligible = rosterLimit === null ? saved : saved.filter((roster) => roster.limit === rosterLimit)
  const { data: references } = useQuery(gameReferencesQuery())
  const [choosingRoster, setChoosingRoster] = useState(!you.roster)
  const [step, setStep] = useState(0)
  const [firstPlayerId, setFirstPlayerId] = useState(view.players[0]?.id ?? view.viewerId)
  const [attackerId, setAttackerId] = useState(view.players[0]?.id ?? view.viewerId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const ready = view.players.every((player) => player.roster)
  const steps = ['Format', 'Army', 'Battlefield', 'Formations', 'Cards', 'Start']
  /** What still has to be true before a step can be left behind. */
  const blocking = (at: number) => {
    if (at === 1 && !you.roster) return 'Choose a roster to continue.'
    if (at === 2 && !view.deploymentId) return 'Choose a battlefield layout to continue.'
    return null
  }
  const blocked = blocking(step)
  const configure = (settings: Partial<Omit<Extract<Command, { kind: 'configure-battle' }>, 'kind'>>) =>
    send({
      kind: 'configure-battle',
      limit: view.settings.limit ?? 2000,
      missionPackId: view.settings.missionPackId,
      terrainLayoutId: view.settings.terrainLayoutId,
      twistId: view.settings.twistId,
      solo: view.settings.solo,
      teamBattle: view.settings.teamBattle,
      clockLimitMinutes: null,
      ...settings,
    })
  const remove = useMutation({
    mutationFn: () => deleteBattle({ data: { token: view.token } }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: battleQuery(view.token).queryKey })
      await queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey })
      await navigate({ to: '/battles' })
    },
  })
  const attach = useMutation({
    mutationFn: async (savedRoster: (typeof saved)[number]) => {
      const priced = await savedRosterPrice({ data: { id: savedRoster.id } })
      if (!priced) throw new Error('That roster could not be loaded.')
      return { roster: battleRoster(savedRoster, priced) }
    },
    onSuccess: ({ roster }) => {
      // Cards are settled by the battle, not carried in with the list: attaching a roster starts them fresh.
      send({ kind: 'attach-roster', roster, prep: null })
      setChoosingRoster(false)
    },
  })

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <header className="border-b border-edge pb-4">
        <p className="eyebrow">Battle setup</p>
        <h1 className="mt-1 text-2xl">
          {view.settings.solo
            ? `${you.name} practice battle`
            : `${you.name} versus ${opponents.map((player) => player.name).join(' & ') || 'open seat'}`}
        </h1>
        <p className="mt-2 text-sm text-dim">One step at a time. Every choice is saved as soon as you make it.</p>
      </header>

      <nav aria-label="Setup steps" className="flex flex-wrap items-center gap-1.5">
        {steps.map((name, at) => (
          <Button
            key={name}
            variant={at === step ? 'default' : 'outline'}
            size="xs"
            // Only ground already covered can be jumped back to; forward is earned a step at a time.
            disabled={at > step}
            aria-current={at === step ? 'step' : undefined}
            onClick={() => setStep(at)}
          >
            {at + 1} · {name}
          </Button>
        ))}
      </nav>

      {step === 0 ? (
        <section className="space-y-4 border border-edge bg-panel p-4">
          <div>
            <p className="eyebrow">Battle settings</p>
            <h2 className="mt-1 text-lg">Format</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {GAME_SIZES.map((size) => (
              <Button
                key={size.limit}
                variant={view.settings.limit === size.limit ? 'default' : 'outline'}
                size="sm"
                disabled={pending}
                onClick={() => configure({ limit: size.limit })}
              >
                {size.name} · {size.limit}
              </Button>
            ))}
          </div>
          {references?.packs.length ? (
            <div className="flex flex-wrap gap-2">
              {references.packs.map((pack) => (
                <Button
                  key={pack.id}
                  variant={view.settings.missionPackId === pack.id ? 'default' : 'outline'}
                  size="sm"
                  disabled={pending}
                  onClick={() => configure({ missionPackId: pack.id })}
                >
                  {pack.name}
                </Button>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-dim">
            {isKotcLimit(view.settings.limit)
              ? 'The synced rules source does not yet provide the KOTC 2.0 battlefield or structured twists. Use the prototype pack for setup; Praetorium will not substitute the older 9-inch deployment.'
              : 'The synced rules source does not currently provide structured twist cards, so none are invented here.'}
          </p>
        </section>
      ) : null}

      {step === 1 ? (
        <>
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
              {eligible.length ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {eligible.map((roster) => (
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
                <p className="mt-3 border border-edge bg-panel p-4 text-sm text-dim">
                  {saved.length ? 'No saved roster matches this battle size.' : 'You do not have a saved roster yet.'}
                </p>
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

          {opponents.map((opponent) => (
            <p key={opponent.id} className="text-sm text-dim">
              {opponent.roster ? `${opponent.name} is ready.` : `Waiting for ${opponent.name} to choose a roster.`}
            </p>
          ))}
        </>
      ) : null}

      {step === 2 && you.roster && !choosingRoster ? (
        <section className="space-y-5 border border-edge bg-panel p-4">
          <div>
            <p className="eyebrow">Battlefield</p>
            <h2 className="mt-1 text-lg">Deployment and terrain</h2>
          </div>
          {mission ? <p className="text-sm text-dim">Mission matchup · {mission.name}</p> : null}
          <Battlefield view={view} send={send} pending={pending} allowedIds={mission?.deploymentIds} />
        </section>
      ) : null}

      {step === 3 && you.units.length ? (
        <section className="space-y-3 border border-edge bg-panel p-4">
          <div>
            <p className="eyebrow">Formations</p>
            <h2 className="mt-1 text-lg">Place your units</h2>
          </div>
          {you.units.map((unit) => (
            <div key={unit.key} className="flex flex-wrap items-center justify-between gap-2 border-t border-edge pt-2 text-sm">
              <span>
                {unit.name}
                {unit.prebattleRules?.length ? <span className="ml-2 text-xs text-azure">{unit.prebattleRules.join(' · ')}</span> : null}
              </span>
              <div className="flex flex-wrap gap-1">
                {UNIT_FORMATIONS.filter(
                  (formation) =>
                    formation === 'battlefield' || formation === 'strategic-reserves' || unit.formationOptions?.includes(formation),
                ).map((formation) => (
                  <Button
                    key={formation}
                    variant={unit.formation === formation ? 'default' : 'outline'}
                    size="xs"
                    disabled={pending}
                    onClick={() => send({ kind: 'set-unit-formation', unitKey: unit.key, formation })}
                  >
                    {formation.replaceAll('-', ' ')}
                  </Button>
                ))}
              </div>
            </div>
          ))}
          <Button
            variant={you.painted ? 'default' : 'outline'}
            size="sm"
            onClick={() => send({ kind: 'set-painted', painted: !you.painted })}
          >
            Battle ready army · +10 VP
          </Button>
        </section>
      ) : null}

      {step === 4 && you.roster ? (
        <section className="space-y-3 border border-edge bg-panel p-4">
          <div>
            <p className="eyebrow">Cards</p>
            <h2 className="mt-1 text-lg">Stratagems and missions</h2>
            <p className="mt-1 text-sm text-dim">
              Chosen before the first turn: what you bring cannot change once the battle is under way.
            </p>
          </div>
          <Prep view={view} missionId={mission?.id ?? null} send={send} pending={pending} />
        </section>
      ) : null}

      {step === 5 && you.roster && view.deploymentId ? (
        ready ? (
          <section className="border border-edge bg-panel p-4">
            <p className="eyebrow">Start the battle</p>
            <h2 className="mt-1 text-lg">Attacker and first turn</h2>
            <p className="mt-3 text-xs text-dim">Attacker</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {view.players.map((player) => (
                <Button key={player.id} variant={attackerId === player.id ? 'default' : 'outline'} onClick={() => setAttackerId(player.id)}>
                  {player.name}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-xs text-dim">First turn</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {view.players.map((player) => (
                <Button
                  key={player.id}
                  variant={firstPlayerId === player.id ? 'default' : 'outline'}
                  onClick={() => setFirstPlayerId(player.id)}
                >
                  {player.name}
                </Button>
              ))}
            </div>
            <Button className="mt-4" disabled={pending} onClick={() => send({ kind: 'begin-battle', firstPlayerId, attackerId })}>
              Start battle
            </Button>
          </section>
        ) : (
          <p className="border border-edge bg-panel p-4 text-sm text-dim">
            Waiting for{' '}
            {opponents
              .filter((player) => !player.roster)
              .map((player) => player.name)
              .join(' & ') || 'the other side'}{' '}
            to choose a roster before starting.
          </p>
        )
      ) : null}

      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}

      <div className="flex items-center justify-between gap-3 border-t border-edge pt-4">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((at) => Math.max(0, at - 1))}>
          Back
        </Button>
        {blocked ? <p className="text-xs text-dim">{blocked}</p> : null}
        <Button
          disabled={step === steps.length - 1 || blocked !== null}
          onClick={() => setStep((at) => Math.min(steps.length - 1, at + 1))}
        >
          Next
        </Button>
      </div>

      <div className="flex justify-between border-t border-edge pt-4">
        <Button variant="outline" disabled={pending} onClick={() => send({ kind: 'reset-setup' })}>
          Reset setup
        </Button>
        {view.creatorId === view.viewerId ? (
          <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
            Delete battle
          </Button>
        ) : null}
      </div>
      {remove.error ? <p className="text-sm text-destructive">{errorMessage(remove.error)}</p> : null}
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
        formationOptions: [...unit.formationOptions],
        prebattleRules: unit.prebattleRules,
      })),
    },
  }
}
