import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { BattleView, Command } from '../../core/battle'
import { ROSTER_MAX_LENGTH, ROSTER_NAME_MAX_LENGTH } from '../../core/battle'
import { factionsQuery } from '../queries'
import { useOrigin } from '../useOrigin'
import { ListBuilder } from './ListBuilder'

type Props = { view: BattleView; send: (command: Command) => void; pending: boolean; problem: string | null }

/**
 * Before the first turn: your list in, your opponent's list in, and a decision
 * about who goes first. A list is either built from the catalogue or pasted in
 * as text, and nothing here reads the text.
 */
export function Muster({ view, send, pending, problem }: Props) {
  const you = view.players.find((player) => player.isViewer)!
  const opponent = view.players.find((player) => !player.isViewer)
  const [armyName, setArmyName] = useState(you.roster?.name ?? '')
  const [text, setText] = useState(you.roster?.text ?? '')
  const origin = useOrigin()
  const { data: available } = useQuery(factionsQuery())
  // An instance with no catalogue synced offers pasting and says nothing about it.
  const [mode, setMode] = useState<'build' | 'paste'>('build')
  const building = Boolean(available) && mode === 'build'
  const ready = view.players.length > 1 && view.players.every((player) => player.roster)

  return (
    <main className="space-y-8">
      <section>
        <p className="eyebrow">Mustering</p>
        <h1 className="mt-1 text-2xl">{opponent ? `${you.name} versus ${opponent.name}` : 'Waiting for an opponent'}</h1>
        {opponent ? null : (
          <div className="mt-4 space-y-2">
            <Label htmlFor="link">Send this link to your opponent</Label>
            <Input id="link" readOnly value={origin ? `${origin}/b/${view.token}` : ''} className="readout text-xs" />
          </div>
        )}
      </section>

      {available ? (
        <div className="flex gap-2">
          <Button variant={mode === 'build' ? 'default' : 'outline'} size="sm" onClick={() => setMode('build')}>
            Build from the catalogue
          </Button>
          <Button variant={mode === 'paste' ? 'default' : 'outline'} size="sm" onClick={() => setMode('paste')}>
            Paste a list
          </Button>
        </div>
      ) : null}

      {building ? (
        <ListBuilder pending={pending} attached={Boolean(you.roster)} onAttach={(roster) => send({ kind: 'attach-roster', roster })} />
      ) : (
        <form
          className="space-y-4 rounded-lg border border-edge bg-panel p-4"
          onSubmit={(event) => {
            event.preventDefault()
            send({ kind: 'attach-roster', roster: { name: armyName, text } })
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

      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}

      {ready ? (
        <section className="space-y-3">
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
        </section>
      ) : null}
    </main>
  )
}
