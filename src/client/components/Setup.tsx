import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Command } from '../../core/battle'
import type { BattleView } from '../../core/battleView'
import { GAME_SIZES, isKotcLimit } from '../../core/battle'
import { gameReferencesQuery } from '../queries'
import { sides as foldSides } from '../sides'
import { Battlefield } from './Battlefield'
import { ArmiesStep } from './setup/ArmiesStep'
import { FirstTurnStep } from './setup/FirstTurnStep'
import { PreBattleStep } from './setup/PreBattleStep'
import { StepRail, type Step } from './setup/StepRail'
import { TableStrip } from './setup/TableStrip'

type Props = {
  view: BattleView
  mission: { id: string; name: string; deploymentIds: string[] } | null
  send: (command: Command) => void
  pending: boolean
  problem: string | null
}

/**
 * Setting the table, in the order the rules set it.
 *
 * The section is folded from the battle log, so moving through setup moves every
 * seated device at once — it is one conversation across the table rather than five
 * private wizards that have to be reconciled at the end.
 */
export function Setup({ view, mission, send, pending, problem }: Props) {
  const table = foldSides(view)
  const yours = table.find((side) => side.isViewer)
  const { data: references } = useQuery(gameReferencesQuery())
  const at = view.setupStep
  const attached = view.players.filter((player) => player.roster).length
  const ready = attached === view.players.length
  const youHaveAnArmy = Boolean(yours?.armies.find((army) => army.isViewer)?.roster)

  const steps: Step[] = [
    {
      name: 'Format',
      detail: view.settings.limit ? `${view.settings.limit} points` : 'Choose a size',
      complete: view.settings.limit !== null,
    },
    { name: 'Armies', detail: `${attached}/${view.players.length} chosen`, complete: ready },
    {
      name: 'Battlefield',
      detail: view.deploymentId ? view.deploymentId.replaceAll('-', ' ') : 'Choose a layout',
      complete: Boolean(view.deploymentId),
    },
    // The cards settle themselves once an army is attached, so having them is what says this section is done.
    {
      name: 'Pre-battle',
      detail: youHaveAnArmy ? 'Reserves and cards' : 'Choose an army first',
      complete: Boolean(yours?.stratagems.length),
    },
    { name: 'First turn', detail: ready && view.deploymentId ? 'Ready to begin' : 'Setup incomplete', complete: false },
  ]

  /** What still has to be true before a section can be left behind. */
  const blocked = (() => {
    if (at === 1 && !youHaveAnArmy) return 'Choose your army to continue.'
    if (at === 2 && !view.deploymentId) return 'Choose a battlefield layout to continue.'
    return null
  })()

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

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
      <header className="space-y-4">
        <div>
          <p className="eyebrow">Battle setup</p>
          <h1 className="mt-0.5 text-2xl">Set the table</h1>
        </div>
        <TableStrip sides={table} solo={view.settings.solo} />
      </header>

      <StepRail steps={steps} at={at} onGo={(step) => send({ kind: 'set-setup-step', step })} />

      <section aria-label={steps[at]?.name} className="min-w-0 space-y-4">
        <div>
          <p className="eyebrow">
            {at + 1} of {steps.length} · {steps[at]?.name}
          </p>
          <h2 className="mt-0.5 text-xl">{HEADLINES[at]}</h2>
          <p className="mt-1 text-sm text-dim">{BLURBS[at]}</p>
        </div>

        {at === 0 ? (
          <div className="space-y-4 rounded-sm border border-edge bg-panel p-4">
            <div className="max-w-sm">
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
              <div>
                <p className="eyebrow">Mission pack</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {references.packs.map((pack) => (
                    <Button
                      key={pack.id}
                      variant={view.settings.missionPackId === pack.id ? 'default' : 'outline'}
                      className={
                        view.settings.missionPackId === pack.id ? 'bg-parchment text-parchment-ink hover:bg-parchment/80' : undefined
                      }
                      size="sm"
                      onClick={() => configure({ missionPackId: pack.id })}
                    >
                      {pack.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="border-t border-edge pt-3 text-xs text-dim">
              {isKotcLimit(view.settings.limit)
                ? 'The synced rules source does not yet provide the KOTC 2.0 battlefield or structured twists. Use the prototype pack for setup; Praetorium will not substitute the older 9-inch deployment.'
                : 'The synced rules source does not currently provide structured twist cards, so none are invented here.'}
            </p>
          </div>
        ) : null}

        {at === 1 ? <ArmiesStep view={view} sides={table} send={send} pending={pending} /> : null}

        {at === 2 && youHaveAnArmy ? (
          <div className="rounded-sm border border-edge bg-panel p-4">
            {mission ? <p className="mb-3 text-sm text-dim">Mission matchup · {mission.name}</p> : null}
            <Battlefield view={view} send={send} pending={pending} allowedIds={mission?.deploymentIds} />
          </div>
        ) : null}

        {at === 3 && youHaveAnArmy ? (
          <PreBattleStep view={view} sides={table} missionId={mission?.id ?? null} send={send} pending={pending} />
        ) : null}

        {at === 4 && view.deploymentId ? <FirstTurnStep sides={table} ready={ready} pending={pending} send={send} /> : null}

        {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      </section>

      <footer className="flex items-center justify-between gap-3 border-t border-edge pt-4">
        <Button variant="outline" disabled={at === 0} onClick={() => send({ kind: 'set-setup-step', step: Math.max(0, at - 1) })}>
          Back
        </Button>
        {blocked ? <p className="text-xs text-dim">{blocked}</p> : null}
        {at === steps.length - 1 ? null : (
          <Button disabled={blocked !== null} onClick={() => send({ kind: 'set-setup-step', step: at + 1 })}>
            Next
          </Button>
        )}
      </footer>
    </main>
  )
}

const HEADLINES = [
  'Choose how you are playing',
  'Choose the armies',
  'Deployment and terrain',
  'Reserves, bonuses and cards',
  'Attacker and first turn',
]

const BLURBS = [
  'The points apply to each side. In a 2v1, the allied side splits them evenly.',
  'Everyone chooses their own army. Every attached army is visible here immediately.',
  'One shared choice sets the table for both sides.',
  'Where every unit starts, and how your side draws its secondary missions.',
  'Record the roll-off, then begin. The first command phase starts as soon as you do.',
]
