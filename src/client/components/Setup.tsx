import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { BattleView, Command, Roster } from '../../core/battle'
import { GAME_SIZES, isKotcLimit, UNIT_FORMATIONS } from '../../core/battle'
import { gameReferencesQuery, savedRostersQuery } from '../queries'
import { errorMessage } from '../queryClient'
import { savedRosterPrice } from '../../server/functions'
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
  const [choosingRoster, setChoosingRoster] = useState(false)
  const step = view.setupStep
  const [firstPlayerId, setFirstPlayerId] = useState(view.players[0]?.id ?? view.viewerId)
  const [attackerId, setAttackerId] = useState(view.players[0]?.id ?? view.viewerId)
  const ready = view.players.every((player) => player.roster)
  const sides = [...new Set(view.players.map((player) => player.side))].map((side) => view.players.filter((player) => player.side === side))
  const sideName = (players: typeof view.players) => players.map((player) => player.name).join(' & ')
  const steps = [
    {
      name: 'Battle',
      detail: view.settings.limit ? `${view.settings.limit} points` : 'Choose the format',
      complete: view.settings.limit !== null,
    },
    { name: 'Armies', detail: `${view.players.filter((player) => player.roster).length}/${view.players.length} ready`, complete: ready },
    {
      name: 'Battlefield',
      detail: view.deploymentId ? view.deploymentId.replaceAll('-', ' ') : 'Choose a layout',
      complete: Boolean(view.deploymentId),
    },
    { name: 'Your army', detail: you.roster ? 'Formations and cards' : 'Choose an army first', complete: Boolean(you.roster) },
    { name: 'Start', detail: ready && view.deploymentId ? 'Ready for first turn' : 'Setup incomplete', complete: false },
  ]
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
        <h1 className="mt-1 text-2xl">{view.settings.solo ? `${you.name} practice battle` : sides.map(sideName).join(' versus ')}</h1>
        <p className="mt-2 text-sm text-dim">Finish the five sections below. Changes save immediately for everyone.</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Setup sections" className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:sticky lg:top-16 lg:grid-cols-1">
          {steps.map(({ name, detail, complete }, at) => (
            <Button
              key={name}
              variant={at === step ? 'default' : 'outline'}
              className="h-auto min-h-14 justify-start rounded-none px-3 py-2 text-left"
              disabled={at > step}
              aria-current={at === step ? 'step' : undefined}
              onClick={() => send({ kind: 'set-setup-step', step: at })}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="readout text-xs">{complete ? '✓' : at + 1}</span>
                <span className="min-w-0">
                  <span className="block font-bold uppercase">{name}</span>
                  <span className={`block truncate text-xs font-normal ${at === step ? 'text-void/75' : 'text-dim'}`}>{detail}</span>
                </span>
              </span>
            </Button>
          ))}
        </nav>
        <div className="min-w-0 space-y-6">
          {step === 0 ? (
            <section className="space-y-4 border border-edge bg-panel p-4">
              <div>
                <p className="eyebrow">1 of 5 · Battle</p>
                <h2 className="mt-1 text-xl">Choose how you are playing</h2>
                <p className="mt-1 text-sm text-dim">The total points apply to each side. In 2v1, the allied side splits them evenly.</p>
              </div>
              <div>
                <Label htmlFor="battle-size" className="eyebrow">
                  Battle size
                </Label>
                <Select
                  value={view.settings.limit === null ? null : String(view.settings.limit)}
                  onValueChange={(value) => value && configure({ limit: Number(value) })}
                >
                  <SelectTrigger id="battle-size" className="mt-1 h-11 w-full rounded-none border-edge bg-sunken font-semibold uppercase">
                    <SelectValue placeholder="Choose a battle size">
                      {(value: unknown) => {
                        const size = GAME_SIZES.find((candidate) => String(candidate.limit) === value)
                        return size ? `${size.name} · ${size.limit}` : 'Choose a battle size'
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {GAME_SIZES.map((size) => (
                      <SelectItem key={size.limit} value={String(size.limit)}>
                        {size.name} · {size.limit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <section className="space-y-4">
              <div className="border-b border-edge pb-2">
                <p className="eyebrow">2 of 5 · Armies</p>
                <h2 className="text-xl">Choose the armies</h2>
                <p className="mt-1 text-sm text-dim">Everyone chooses their own roster. Every attached army is visible here immediately.</p>
              </div>
              <div className="space-y-2">
                {view.players.map((player) => (
                  <article key={player.id} className="flex items-center gap-3 border border-edge bg-panel p-3">
                    <div className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-dim uppercase">{player.name}</span>
                      <span className="block truncate font-bold uppercase">{player.roster?.name ?? 'No roster selected'}</span>
                      <span className="mt-1 block text-xs text-dim">
                        {player.roster?.built?.units.length
                          ? `${player.roster.built.units.length} units · ${player.roster.built.limit} points`
                          : player.roster
                            ? 'Imported roster'
                            : 'Waiting for this player'}
                      </span>
                    </div>
                    {player.isViewer ? (
                      <Button variant="outline" size="sm" onClick={() => setChoosingRoster(true)}>
                        {player.roster ? 'Change roster' : 'Choose roster'}
                      </Button>
                    ) : (
                      <span className={`chip shrink-0 ${player.roster ? 'text-achieved' : 'text-dim'}`}>
                        {player.roster ? 'Ready' : 'Waiting'}
                      </span>
                    )}
                  </article>
                ))}
              </div>
              <RosterChooser
                open={choosingRoster}
                onOpenChange={setChoosingRoster}
                rosters={eligible}
                allRosters={saved}
                selectedName={you.roster?.name}
                pending={pending || attach.isPending}
                onChoose={(roster) => attach.mutate(roster)}
                error={attach.error ? errorMessage(attach.error) : null}
              />
            </section>
          ) : null}

          {step === 2 && you.roster ? (
            <section className="space-y-5 border border-edge bg-panel p-4">
              <div>
                <p className="eyebrow">3 of 5 · Battlefield</p>
                <h2 className="mt-1 text-lg">Deployment and terrain</h2>
                <p className="mt-1 text-sm text-dim">One shared choice sets the table for both sides.</p>
              </div>
              {mission ? <p className="text-sm text-dim">Mission matchup · {mission.name}</p> : null}
              <Battlefield view={view} send={send} pending={pending} allowedIds={mission?.deploymentIds} />
            </section>
          ) : null}

          {step === 3 && you.roster ? (
            <div className="space-y-4">
              <section className="space-y-3 border border-edge bg-panel p-4">
                <div>
                  <p className="eyebrow">4 of 5 · Armies</p>
                  <h2 className="mt-1 text-lg">Prepare every army</h2>
                  <p className="mt-1 text-sm text-dim">
                    Everyone can see formations, Scouts, and pre-battle rules. You control your own units.
                  </p>
                </div>
                {view.players.map((player) => (
                  <div key={player.id} className="border-t border-edge pt-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold uppercase">{player.name}</p>
                        <p className="text-xs text-dim">{player.roster?.name ?? 'No roster selected'}</p>
                      </div>
                      <span className="chip">{player.units.length} units</span>
                    </div>
                    <div className="space-y-2">
                      {player.units.map((unit) => (
                        <div key={unit.key} className="flex flex-wrap items-center justify-between gap-2 bg-sunken p-2 text-sm">
                          <span className="min-w-0">
                            <span className="font-semibold">{unit.name}</span>
                            {unit.prebattleRules?.length ? (
                              <span className="mt-0.5 block text-xs text-azure">{unit.prebattleRules.join(' · ')}</span>
                            ) : null}
                            {unit.formationOptions?.length ? (
                              <span className="mt-0.5 block text-xs text-dim">
                                Can start in {unit.formationOptions.map((formation) => formation.replaceAll('-', ' ')).join(' or ')}
                              </span>
                            ) : null}
                          </span>
                          {player.isViewer ? (
                            <div className="flex flex-wrap gap-1">
                              {UNIT_FORMATIONS.filter(
                                (formation) =>
                                  formation === 'battlefield' ||
                                  formation === 'strategic-reserves' ||
                                  unit.formationOptions?.includes(formation),
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
                          ) : (
                            <span className="chip shrink-0">{unit.formation.replaceAll('-', ' ')}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {player.isViewer ? (
                      <Button
                        className="mt-2"
                        variant={player.painted ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => send({ kind: 'set-painted', painted: !player.painted })}
                      >
                        Battle ready army · +10 VP
                      </Button>
                    ) : (
                      <p className="mt-2 text-xs text-dim">
                        {player.painted ? 'Battle ready bonus selected.' : 'Battle ready bonus not selected.'}
                      </p>
                    )}
                  </div>
                ))}
              </section>
              <section className="space-y-3 border border-edge bg-panel p-4">
                <div>
                  <p className="eyebrow">Shared resources</p>
                  <h2 className="mt-1 text-lg">Cards and stratagems</h2>
                  <p className="mt-1 text-sm text-dim">
                    Everyone on your side uses these mission cards, stratagems, victory points, and command points.
                  </p>
                </div>
                <Prep view={view} missionId={mission?.id ?? null} send={send} pending={pending} />
              </section>
            </div>
          ) : null}

          {step === 4 && you.roster && view.deploymentId ? (
            ready ? (
              <section className="space-y-4 border border-edge bg-panel p-4">
                <div>
                  <p className="eyebrow">5 of 5 · Start</p>
                  <h2 className="mt-1 text-xl">Review the table</h2>
                  <p className="mt-1 text-sm text-dim">Every army is ready. Choose which side attacks and takes the first turn.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {sides.map((players) => (
                    <div key={players[0]?.side} className="border border-edge bg-sunken p-3">
                      <p className="font-bold uppercase">{sideName(players)}</p>
                      <p className="mt-1 text-xs text-dim">{players.map((player) => player.roster?.name).join(' · ')}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-dim">Attacker</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {sides.map((players) => (
                    <Button
                      key={players[0]?.side}
                      variant={players.some((player) => player.id === attackerId) ? 'default' : 'outline'}
                      onClick={() => setAttackerId(players[0].id)}
                    >
                      {sideName(players)}
                    </Button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-dim">First turn</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {sides.map((players) => (
                    <Button
                      key={players[0]?.side}
                      variant={players.some((player) => player.id === firstPlayerId) ? 'default' : 'outline'}
                      onClick={() => setFirstPlayerId(players[0].id)}
                    >
                      {sideName(players)}
                    </Button>
                  ))}
                </div>
                <Button
                  className="h-11 w-full"
                  disabled={pending}
                  onClick={() => send({ kind: 'begin-battle', firstPlayerId, attackerId })}
                >
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
            <Button
              variant="outline"
              disabled={step === 0 || pending}
              onClick={() => send({ kind: 'set-setup-step', step: Math.max(0, step - 1) })}
            >
              Back
            </Button>
            {blocked ? <p className="text-xs text-dim">{blocked}</p> : null}
            <Button
              disabled={step === steps.length - 1 || blocked !== null || pending}
              onClick={() => send({ kind: 'set-setup-step', step: Math.min(steps.length - 1, step + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </main>
  )
}

type SavedRoster = Awaited<ReturnType<NonNullable<ReturnType<typeof savedRostersQuery>['queryFn']>>>[number]

function RosterChooser({
  open,
  onOpenChange,
  rosters,
  allRosters,
  selectedName,
  pending,
  onChoose,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rosters: SavedRoster[]
  allRosters: SavedRoster[]
  selectedName?: string
  pending: boolean
  onChoose: (roster: SavedRoster) => void
  error: string | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-none border border-edge bg-panel text-bone sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase">Choose your roster</DialogTitle>
          <DialogDescription className="text-dim">Rosters are shown in the same order as your roster library.</DialogDescription>
        </DialogHeader>
        <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>Rosters</span>
          <span className="readout">{rosters.length}</span>
        </p>
        <div className="space-y-2">
          {rosters.length ? (
            rosters.map((roster) => (
              <button
                key={roster.id}
                type="button"
                disabled={pending}
                onClick={() => onChoose(roster)}
                className="flex w-full items-center gap-3 border border-edge bg-sunken p-3 text-left hover:border-azure disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold uppercase">{roster.name}</span>
                  <span className="mt-1 block text-xs text-dim">
                    11th edition · {GAME_SIZES.find((size) => size.limit === roster.limit)?.name ?? `${roster.limit} points`} ·{' '}
                    {roster.picks.length} units
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="chip block">{roster.limit} pts</span>
                  {selectedName === roster.name ? <span className="mt-1 block text-xs text-achieved">Selected</span> : null}
                </span>
              </button>
            ))
          ) : (
            <p className="border border-edge bg-sunken p-4 text-sm text-dim">
              {allRosters.length ? 'No saved roster matches this battle size.' : 'You do not have a saved roster yet.'}
            </p>
          )}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  )
}

function battleRoster(saved: SavedRoster, priced: NonNullable<Awaited<ReturnType<typeof savedRosterPrice>>>): Roster {
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
