import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Toggle } from '@/components/ui/toggle'
import type { BattleView, Command } from '../../core/battle'
import { ROSTER_MAX_LENGTH, ROSTER_NAME_MAX_LENGTH } from '../../core/battle'
import { catalogueStatusQuery, factionsQuery } from '../queries'
import { useOrigin } from '../useOrigin'
import { Battlefield } from './Battlefield'
import { Disclosure } from './Disclosure'
import { ListBuilder } from './ListBuilder'
import { Prep } from './Prep'

type Props = { view: BattleView; send: (command: Command) => void; pending: boolean; problem: string | null }
const ROSTER_MODES = ['build', 'paste'] as const
const SETUP_STAGES = [
  ['roster', '1', 'Roster'],
  ['battlefield', '2', 'Battlefield'],
  ['missions', '3', 'Missions'],
  ['ready', '4', 'Ready'],
] as const
type SetupStage = (typeof SETUP_STAGES)[number][0]

/**
 * Before the first turn: your list in, your opponent's list in, and a decision
 * about who goes first. A list is either built from the catalogue or pasted in
 * as text, and nothing here reads the text.
 */
export function Setup({ view, send, pending, problem }: Props) {
  const you = view.players.find((player) => player.isViewer)!
  const opponent = view.players.find((player) => !player.isViewer)
  const [armyName, setArmyName] = useState(you.roster?.name ?? '')
  const [text, setText] = useState(you.roster?.text ?? '')
  const origin = useOrigin()
  const { data: available } = useQuery(factionsQuery())
  const { data: sync } = useQuery(catalogueStatusQuery())
  // An instance with no catalogue synced offers pasting and says nothing about it.
  const [mode, setMode] = useState<'build' | 'paste'>('build')
  const [stage, setStage] = useState<SetupStage>(() => (!you.roster ? 'roster' : view.deploymentId ? 'missions' : 'battlefield'))
  const building = Boolean(available) && mode === 'build'
  const ready = view.players.length > 1 && view.players.every((player) => player.roster)

  return (
    // Wide enough for the builder's three panes, and the rest of the screen simply
    // does not use the room.
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6">
      <section className="max-w-2xl">
        <p className="eyebrow">Battle setup</p>
        <h1 className="mt-1 text-2xl">{opponent ? `${you.name} versus ${opponent.name}` : 'Waiting for an opponent'}</h1>
        {opponent ? null : (
          <div className="mt-4 space-y-2">
            <Label htmlFor="link">Send this link to your opponent</Label>
            <Input id="link" readOnly value={origin ? `${origin}/b/${view.token}` : ''} className="readout text-xs" />
          </div>
        )}
      </section>

      <nav className="grid max-w-3xl grid-cols-4 border border-edge bg-panel" aria-label="Battle setup steps">
        {SETUP_STAGES.map(([id, number, label]) => (
          <Button
            key={id}
            variant="ghost"
            className={`h-auto flex-col items-start gap-0 rounded-none border-x-transparent border-t-transparent border-b-2 px-2 py-2 text-left focus-visible:border-x-transparent focus-visible:border-t-transparent focus-visible:ring-0 sm:flex-row sm:items-center sm:gap-1 sm:py-3 ${stage === id ? 'border-b-azure bg-raised' : 'border-b-transparent'} ${id !== 'roster' && !you.roster ? 'text-faint' : ''}`}
            disabled={id !== 'roster' && !you.roster}
            aria-current={stage === id ? 'step' : undefined}
            onClick={() => setStage(id)}
          >
            <span className="eyebrow block">Step {number}</span>
            <span className="text-xs font-bold uppercase sm:text-sm">{label}</span>
          </Button>
        ))}
      </nav>

      {!available && sync && sync.status !== 'ready' ? (
        <p className="rounded-lg border border-edge bg-panel p-3 text-sm text-dim">
          {sync.status === 'failed'
            ? `The community data could not be fetched: ${sync.detail ?? 'unknown reason'}. Pasting a list still works.`
            : 'Fetching the community data. List building will appear when it lands; pasting works meanwhile.'}
        </p>
      ) : null}

      {stage === 'roster' && available ? (
        <ToggleGroup
          value={[mode]}
          onValueChange={(value) => {
            const next = ROSTER_MODES.find((entry) => entry === value[0])
            if (next) setMode(next)
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="build">Build from the catalogue</ToggleGroupItem>
          <ToggleGroupItem value="paste">Paste a list</ToggleGroupItem>
        </ToggleGroup>
      ) : null}

      {stage !== 'roster' ? null : building ? (
        // The builder is the page while it is open, so it gets the height rather
        // than growing a second scrollbar inside the one the page already has.
        <section className="relative left-1/2 flex h-[calc(100dvh-11rem)] min-h-120 w-screen -translate-x-1/2 flex-col">
          <ListBuilder
            pending={pending}
            attached={Boolean(you.roster)}
            onAttach={(roster) => {
              send({ kind: 'attach-roster', roster })
              setStage('battlefield')
            }}
            prep={{
              stratagems: you.stratagems.map(({ key, name, cp, limit }) => ({ key, name, cp, limit })),
              secondaries: you.secondaries.map(({ key, name }) => ({ key, name })),
            }}
            onRestorePrep={(restored) =>
              send({ kind: 'set-prep', ...restored, primary: you.primaryCard, secondaryMode: you.secondaryMode })
            }
          />
        </section>
      ) : (
        <form
          className="max-w-2xl space-y-4 border border-edge bg-panel p-4"
          onSubmit={(event) => {
            event.preventDefault()
            send({ kind: 'attach-roster', roster: { name: armyName, text } })
            setStage('battlefield')
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="army">Your army</Label>
            <Input
              id="army"
              value={armyName}
              onChange={(event) => setArmyName(event.target.value)}
              maxLength={ROSTER_NAME_MAX_LENGTH}
              placeholder="Ultramarines strike force"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list">Your list</Label>
            <Textarea
              id="list"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={ROSTER_MAX_LENGTH}
              rows={8}
              placeholder="Paste it in. Nothing here reads it yet."
              className="readout text-xs"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={pending || !armyName.trim() || !text.trim()}>
            {you.roster ? 'Update my list' : 'Attach my list'}
          </Button>
        </form>
      )}

      {opponent ? (
        <p className="text-sm text-dim">
          {opponent.roster ? `${opponent.name} has attached ${opponent.roster.name}.` : `Waiting for ${opponent.name}’s list.`}
        </p>
      ) : null}

      {you.roster && stage === 'battlefield' ? (
        <div className="space-y-5 rounded-lg border border-edge bg-panel p-4">
          <Battlefield
            view={view}
            send={(command) => {
              send(command)
              if (command.kind === 'set-deployment' && command.patternId) setStage('missions')
            }}
            pending={pending}
          />

          {you.units.length ? (
            <section className="space-y-2">
              <Label>
                Deploy your army{' '}
                <span className="readout text-xs text-dim">
                  {you.deployed}/{you.units.length}
                </span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {you.units.map((unit) => (
                  <Toggle
                    key={unit.key}
                    variant="outline"
                    size="sm"
                    pressed={unit.deployed}
                    disabled={pending}
                    onPressedChange={(pressed) => send({ kind: 'deploy-unit', unitKey: unit.key, deployed: pressed })}
                  >
                    {unit.name}
                  </Toggle>
                ))}
              </div>
              <p className="text-xs text-dim">Anything left off the table is in reserve, and can arrive later.</p>
            </section>
          ) : null}
        </div>
      ) : null}

      <Disclosure
        label="Stratagems and secondaries"
        className={`${stage === 'missions' ? '' : 'hidden'} rounded-lg border border-edge bg-panel p-4`}
        triggerClassName="text-sm"
        defaultOpen
      >
        <p className="mt-2 mb-4 text-xs text-dim">
          Neither is in the community data, so copy them from your own book once. The app takes it from there.
        </p>
        <Prep
          view={view}
          send={(command) => {
            send(command)
            if (command.kind === 'set-prep') setStage('ready')
          }}
          pending={pending}
        />
      </Disclosure>

      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}

      {stage === 'ready' ? (
        <section className="space-y-3">
          {ready ? (
            <>
              <p className="eyebrow">Who takes the first turn</p>
              <div className="flex flex-wrap gap-2">
                {view.players.map((player) => (
                  <Button
                    key={player.id}
                    disabled={pending}
                    className="h-11 text-base"
                    onClick={() => send({ kind: 'begin-battle', firstPlayerId: player.id })}
                  >
                    {player.name} goes first
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p className="border border-edge bg-panel p-4 text-sm text-dim">
              Both players need to attach a roster before the battle can begin.
            </p>
          )}
        </section>
      ) : null}
    </main>
  )
}
