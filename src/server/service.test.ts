import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBattleEvents } from '../adapters/events'
import { closeDatabase, type PraetoriumDatabase, openDatabase } from '../db/connection'
import { Repository } from '../db/repository'
import { user } from '../db/schema'
import { PraetoriumService } from './service'

let database: PraetoriumDatabase
let service: PraetoriumService
let now = 0

beforeEach(() => {
  database = openDatabase(':memory:')
  now = 0
  service = new PraetoriumService(new Repository(database), () => ++now, createBattleEvents())
  enrol('alice', 'Alice')
  enrol('bob', 'Bob')
  enrol('carol', 'Carol')
})

/**
 * A player with the account behind them, because there is no other kind.
 *
 * The id is fixed so the tests can name who is acting; `playerForUser` mints its
 * own, which is right for the app and useless for reading a test.
 */
function enrol(id: string, name: string) {
  const at = new Date(0)
  database
    .insert(user)
    .values({ id: `user-${id}`, name, email: `${id}@example.test`, emailVerified: false, createdAt: at, updatedAt: at })
    .run()
  new Repository(database).upsertPlayer({ id, name, userId: `user-${id}`, now: ++now })
}

afterEach(() => closeDatabase(database))

/** Two players, both lists in, Alice going first. Returns the link and the live seq. */
function started() {
  const { token } = service.createBattle('alice')
  service.join(token, 'bob')
  let seq = 0
  const send = (by: string, command: Parameters<PraetoriumService['submit']>[3]) => {
    const { result } = service.submit(token, by, seq, command)
    if (result.outcome === 'appended') seq = result.seq
    return result
  }
  send('alice', { kind: 'attach-roster', roster: { name: 'Ultramarines', text: '10 Intercessors' } })
  send('bob', { kind: 'attach-roster', roster: { name: 'Death Guard', text: '10 Plague Marines' } })
  send('alice', { kind: 'begin-battle', firstPlayerId: 'alice' })
  return { token, send, seq: () => seq }
}

/** The status a rejected call answered with; reads answer null, so a throw is a real refusal. */
function refusalStatus(work: () => unknown) {
  try {
    work()
    return null
  } catch (error) {
    return error instanceof Response ? error.status : null
  }
}

function view(token: string, playerId: string) {
  const screen = service.screen(token, playerId)
  if (screen.kind !== 'battle') throw new Error('expected a seat')
  return screen.view
}

describe('seats', () => {
  it('seats whoever opened the battle', () => {
    const { token } = service.createBattle('alice')
    expect(view(token, 'alice').players).toHaveLength(1)
  })

  it('seats the second player who follows the link', () => {
    const { token } = service.createBattle('alice')
    expect(service.join(token, 'bob')).toBe('joined')
  })

  it('turns a third player away', () => {
    const { token } = service.createBattle('alice')
    service.join(token, 'bob')
    expect(service.join(token, 'carol')).toBe('full')
  })

  it('shows a link holder the invitation rather than the battle', () => {
    const { token } = service.createBattle('alice')
    expect(service.screen(token, 'carol').kind).toBe('invitation')
  })

  it('does not seat someone merely for reading the link', () => {
    const { token } = service.createBattle('alice')
    service.screen(token, 'carol')
    expect(service.join(token, 'bob')).toBe('joined')
  })

  it('refuses a command from someone without a seat', () => {
    const { token } = service.createBattle('alice')
    expect(refusalStatus(() => service.submit(token, 'carol', 0, { kind: 'advance' }))).toBe(403)
  })
})

describe('battle history', () => {
  it('lists only battles the player is seated in', () => {
    service.createBattle('bob')
    started()
    expect(service.battles('alice')).toHaveLength(1)
  })

  it('folds the current status and scores from the log', () => {
    const { send } = started()
    send('alice', { kind: 'score', category: 'primary', delta: 5 })
    expect(service.battles('alice')[0]).toMatchObject({
      status: 'playing',
      round: 1,
      phase: 'command',
      scores: [5, 0],
      armies: ['Ultramarines', 'Death Guard'],
    })
  })
})

describe('the command log', () => {
  it('numbers commands from one', () => {
    const { token } = service.createBattle('alice')
    const answer = service.submit(token, 'alice', 0, { kind: 'attach-roster', roster: { name: 'Ultramarines', text: '10 Intercessors' } })
    expect(answer.result).toEqual({ outcome: 'appended', seq: 1 })
  })

  it('derives the score from the log alone', () => {
    const { token, send } = started()
    send('alice', { kind: 'score', category: 'primary', delta: 5 })
    expect(view(token, 'alice').players.find((player) => player.isViewer)?.total).toBe(5)
  })

  it('shows both players the same numbers', () => {
    const { token, send } = started()
    send('alice', { kind: 'score', category: 'primary', delta: 5 })
    expect(view(token, 'bob').players.find((player) => player.id === 'alice')?.total).toBe(5)
  })
})

/**
 * A command's answer has to describe the battle the command produced, because it
 * is what the sender's next command is conditional on. A page left to learn that
 * from a refetch acts on a view older than its own last command.
 */
describe('the answer to a command', () => {
  it('carries the state that command produced', () => {
    const { token, seq } = started()
    const answer = service.submit(token, 'alice', seq(), { kind: 'score', category: 'primary', delta: 5 })
    expect(answer.screen.view.seq).toBe(seq() + 1)
  })

  it('names the command just sent as the one to undo', () => {
    const { token, seq } = started()
    const answer = service.submit(token, 'alice', seq(), { kind: 'score', category: 'primary', delta: 5 })
    expect(answer.screen.view.undoable).toBe(answer.screen.view.seq)
  })

  it('corrects a sender that had fallen behind', () => {
    const { token, send, seq } = started()
    const shared = seq()
    send('alice', { kind: 'advance' })
    const answer = service.submit(token, 'bob', shared, { kind: 'score', category: 'primary', delta: 5 })
    expect(answer.screen.view.seq).toBe(shared + 1)
  })
})

describe('two players acting at once', () => {
  it('appends the command that arrived first', () => {
    const { token, seq } = started()
    const shared = seq()
    expect(service.submit(token, 'alice', shared, { kind: 'advance' }).result).toEqual({ outcome: 'appended', seq: shared + 1 })
  })

  it('refuses the one that was built on history it had already lost', () => {
    const { token, seq } = started()
    const shared = seq()
    service.submit(token, 'alice', shared, { kind: 'advance' })
    expect(service.submit(token, 'bob', shared, { kind: 'score', category: 'primary', delta: 5 }).result).toEqual({
      outcome: 'stale',
      seq: shared + 1,
    })
  })

  it('leaves a stale command out of the log entirely', () => {
    const { token, send, seq } = started()
    const shared = seq()
    send('alice', { kind: 'advance' })
    service.submit(token, 'bob', shared, { kind: 'score', category: 'primary', delta: 5 })
    expect(view(token, 'bob').players.find((player) => player.id === 'bob')?.total).toBe(0)
  })

  it('accepts the loser’s command once it has caught up', () => {
    const { token, send, seq } = started()
    send('alice', { kind: 'advance' })
    expect(service.submit(token, 'bob', seq(), { kind: 'score', category: 'primary', delta: 5 }).result.outcome).toBe('appended')
  })
})

describe('refusals', () => {
  it('explain themselves in the domain’s words', () => {
    const { token, seq } = started()
    expect(service.submit(token, 'bob', seq(), { kind: 'advance' }).result).toEqual({ outcome: 'refused', reason: 'it is not your turn' })
  })

  it('write nothing, so the seq does not move', () => {
    const { token, seq } = started()
    const before = seq()
    service.submit(token, 'bob', before, { kind: 'advance' })
    expect(view(token, 'bob').seq).toBe(before)
  })
})
