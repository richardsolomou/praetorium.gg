import { describe, expect, it } from 'vitest'
import { reduceBattle, type Command } from '../../../core/battle'
import { battleClock } from '../../../core/battleClock'
import { battleView } from '../../../core/battleView'
import { ALICE, BOB, NAMES, PLAYERS, builtRoster, log, started } from '../../../core/battle.fixtures'
import { MAX_WATCH_MESSAGE_BYTES, parseWatchBattle } from '../../../contracts/watchBattle'
import { watchBattle, type WatchReminderPrompt } from './watchBattle'
import type { RosterReminder } from '../../../core/reminders'
import type { MissionAward } from '../../../core/scoring'
import { parseNativeActionRequest } from '../../../../mobile/src/nativeActions'

const personalReminder = (key: string): RosterReminder => ({
  key,
  ability: `Reminder ${key}`,
  description: 'A personal note.',
  timings: [{ moment: 'phase-start', phase: 'command', turn: 'your-turn' }],
})
function screen(entries: [string, Command][] = started(), viewer = ALICE, players = PLAYERS, playerSides?: number[]) {
  const history = log(...entries)
  const view = battleView(
    { token: 'battle' },
    players.map((id) => ({ id, name: NAMES.find((name) => name.id === id)?.name ?? id })),
    reduceBattle(players, history, playerSides),
    viewer,
  )
  return { view, clock: battleClock(players, history, playerSides) }
}
const project = (value: ReturnType<typeof screen>, prompts: WatchReminderPrompt[] = []) =>
  watchBattle(value.view, value.clock, [], () => undefined, prompts, 1000)

describe('watch battle snapshot', () => {
  it('reads scores and CP from the saved battle flow', () => {
    const value = screen([...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }]])
    expect(project(value)?.sides).toEqual([
      { index: 0, name: 'Alice', yours: true, vp: 5, cp: 1 },
      { index: 1, name: 'Bob', yours: false, vp: 0, cp: 1 },
    ])
  })

  it('counts an allied side once without summing its shared resources twice', () => {
    const value = screen(
      [...started(), ['carol', builtRoster('Allies', [])], [ALICE, { kind: 'score', category: 'primary', delta: 5 }]],
      'carol',
      [ALICE, BOB, 'carol'],
      [0, 1, 0],
    )
    expect(project(value)?.sides).toEqual([
      { index: 0, name: 'Alice & carol', yours: true, vp: 5, cp: 1 },
      { index: 1, name: 'Bob', yours: false, vp: 0, cp: 1 },
    ])
  })

  it.each(['spectator', 'setup', 'finished'])('does not publish a %s battle', (kind) => {
    const value = screen()
    if (kind === 'spectator') value.view = battleView({ token: 'battle' }, NAMES, reduceBattle(PLAYERS, log(...started())), 'visitor')
    else value.view.status = kind as 'setup' | 'finished'
    expect(project(value)).toBeNull()
  })

  it('never includes the opposing hidden mission or deck', () => {
    const secret = { key: 'secret', name: 'Hidden purpose' }
    const value = screen([
      ...started(),
      [BOB, { kind: 'set-prep', stratagems: [], secondaries: [], secondaryDeck: [secret], primary: null, secondaryMode: 'fixed' }],
      [ALICE, { kind: 'select-secret', playerId: BOB, secondary: secret }],
    ])
    expect(JSON.stringify(project(value))).not.toContain('Hidden purpose')
  })

  it('shows the owner their private objective', () => {
    const secret = { key: 'secret', name: 'Hidden purpose' }
    const value = screen(
      [
        ...started(),
        [BOB, { kind: 'set-prep', stratagems: [], secondaries: [], secondaryDeck: [secret], primary: null, secondaryMode: 'fixed' }],
        [ALICE, { kind: 'select-secret', playerId: BOB, secondary: secret }],
      ],
      BOB,
    )
    expect(project(value)?.objectives).toEqual([
      { id: 'secret', name: 'Hidden purpose', kind: 'Secret', points: 0, summary: 'Check the full card on your iPhone.' },
    ])
  })

  it.each([0, 1, 3])('publishes %i saved personal reminders', (count) => {
    const command = builtRoster('Army', [])
    if (command.kind !== 'attach-roster') throw new Error('Expected roster')
    command.roster.reminders = Array.from({ length: count }, (_, index) => personalReminder(String(index)))
    const value = screen([[ALICE, command], ...started().slice(1)])
    const reminders = value.view.players.find((player) => player.isViewer)?.roster?.reminders ?? []
    expect(
      project(value, [{ reminders, moment: 'Start of your Command phase', context: { round: 1, activePlayerId: ALICE, phase: 'command' } }])
        ?.reminders,
    ).toHaveLength(count)
  })

  it('retains the server read timestamp instead of renewing cached data', () => {
    expect(project(screen())?.updatedAt).toBe(1000)
  })

  it('preserves scoring round restrictions and alternative payouts', () => {
    const award: MissionAward = {
      vp: 3,
      per: null,
      mode: null,
      max: null,
      group: 'tier',
      cumulative: false,
      criteria: 'Hold one objective.',
      trigger: { timing: 'end-of-turn', phase: null, playerTurn: 'your-turn', roundMin: 2, roundMax: 4 },
    }
    const value = screen([
      [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [],
          secondaries: [],
          primary: { key: 'primary', name: 'Primary', awards: [award, { ...award, vp: 5, criteria: 'Hold two objectives.' }] },
          secondaryMode: 'fixed',
        },
      ],
      ...started(),
    ])
    expect(project(value)?.objectives[0]?.summary).toBe(
      'End of your turn · Battle rounds 2–4: 3 VP. Hold one objective.\n\nor · End of your turn · Battle rounds 2–4: 5 VP. Hold two objectives.',
    )
  })

  it('stops the projected clock while paused', () => {
    expect(project(screen([...started(), [ALICE, { kind: 'pause-clock' }]]))?.turnRunning).toBe(false)
  })

  it('bounds unicode snapshots and reports reminders left on the phone', () => {
    const value = screen()
    const prompts: WatchReminderPrompt[] = [
      {
        context: { round: 1, activePlayerId: ALICE, phase: 'command' },
        moment: '😀'.repeat(160),
        reminders: Array.from({ length: 100 }, (_, index) => ({
          ...personalReminder(String(index)),
          ability: '😀'.repeat(80),
          description: '😀'.repeat(10000),
        })),
      },
    ]
    const result = project(value, prompts)
    expect({
      valid: parseWatchBattle(result) !== null,
      bounded: new TextEncoder().encode(JSON.stringify(result)).length < MAX_WATCH_MESSAGE_BYTES,
      count: result?.reminders.length,
      more: result?.moreReminders,
    }).toEqual({ valid: true, bounded: true, count: 20, more: 80 })
  })

  it('keeps escaped reminder text within the native delivery limit', () => {
    const result = project(screen(), [
      {
        context: { round: 1, activePlayerId: ALICE, phase: 'command' },
        moment: 'Start of your Command phase',
        reminders: Array.from({ length: 20 }, (_, index) => ({ ...personalReminder(String(index)), description: '\u0000'.repeat(500) })),
      },
    ])
    expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-watch-battle', snapshot: result }))?.kind).toBe(
      'watch-battle',
    )
  })
})
