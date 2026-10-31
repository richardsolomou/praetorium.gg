import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ability, bookOf, points } from '../../server/catalogue.fixtures'
import type { AbilityReminder } from '../../core/reminders'
import { queryResource } from './actionFunctions'
import { abilityRemindersKey } from '../queries/queryKeys'
import { saveRosterSchema } from '../../contracts/schemas'
import type { BattleWorkspace } from '../../contracts/battleWorkspace'
import { openBattle, submit } from './battleFunctions'
import { ALICE, log, started, turns } from '../../core/battle.fixtures'

const mocks = vi.hoisted(() => ({
  construction: vi.fn(),
  hasConstruction: vi.fn(),
  document: vi.fn(),
  queue: vi.fn(),
  workspace: vi.fn(),
  submit: vi.fn(),
  open: vi.fn(),
  changes: vi.fn(),
  saved: vi.fn(),
  remember: vi.fn(),
  sync: vi.fn(),
}))
vi.mock('../../server/functions', () => ({ submit: mocks.submit, openBattle: mocks.open }))
vi.mock('../../server/functions/offline', () => ({ battleWorkspace: mocks.workspace }))
vi.mock('./construction', () => ({
  localConstruction: async () => mocks.construction(),
  battleRules: async () => mocks.construction(),
  loadLocalRules: async () => mocks.construction(),
  localRules: () => mocks.construction(),
  hasLocalConstruction: mocks.hasConstruction,
}))
vi.mock('./localRuntime', () => ({
  localEngine: () => ({ storage: { read: async () => ({ operations: [] }) } }),
  localOwner: () => ({ id: 'alice' }),
  localDocument: mocks.document,
  queueLocal: mocks.queue,
  localClient: vi.fn(),
  hasLocalChanges: mocks.saved,
  hasSyncableChanges: mocks.changes,
  rememberBattle: mocks.remember,
  rememberDocument: vi.fn(),
  syncLocalWork: vi.fn(),
  attemptLocalSync: mocks.sync,
}))

const workspace: BattleWorkspace = {
  battle: { id: 'battle', token: 'battle', createdAt: 0 },
  players: [
    { id: 'alice', name: 'Alice', side: 0, automated: false },
    { id: 'bob', name: 'Bob', side: 1, automated: true },
  ],
  log: [],
  serverSeq: 0,
  serverNow: 0,
}

function prepare(cost: number, copies = 1, alerts?: AbilityReminder[]) {
  const catalogue = bookOf({
    selectionEntries: [
      {
        id: 'lord',
        name: 'Unit',
        type: 'model',
        costs: points(cost),
        profiles: [ability('charge', 'Charge')],
        constraints: [{ id: 'lord-max', type: 'max', value: 1, field: 'selections', scope: 'force', includeChildSelections: true }],
      },
    ],
  })
  const roster = saveRosterSchema.parse({
    id: 'roster',
    name: 'Army',
    catalogueId: 'cat',
    detachmentIds: [],
    disposition: null,
    limit: 1_000,
    picks: Array.from({ length: copies }, () => ({ entryId: 'lord' })),
    waivedRules: ['warlord'],
    optionalRules: [],
    prep: null,
  })
  mocks.hasConstruction.mockReturnValue(true)
  mocks.construction.mockReturnValue({
    revision: catalogue.index.revision,
    catalogue,
    rules: {
      factionKeys: new Map(),
      detachmentReferences: new Map(),
      detachmentDetails: new Map(),
      factionRestrictions: new Map(),
      missions: new Map(),
      deployments: [],
    },
  })
  const documents: Record<string, unknown> = {
    'battle:battle': workspace,
    'roster:roster': roster,
    [queryResource(abilityRemindersKey())]: alerts,
  }
  mocks.document.mockImplementation(async (resource: string) => documents[resource])
}

const attach = () => submit({ data: { token: 'battle', expectedSeq: 0, command: { kind: 'attach-saved-roster', rosterId: 'roster' } } })
beforeEach(() => vi.resetAllMocks())
afterEach(() => vi.unstubAllGlobals())

it('freezes an offline roster from real pricing and records the validation revision before sync', async () => {
  prepare(80)
  await attach()
  expect(mocks.queue.mock.calls[0]?.[1]).toMatchObject({
    catalogueRevision: 'test-revision',
    command: { kind: 'attach-roster', roster: { built: { revision: 'test-revision', units: [{ points: 80 }] } } },
    capturedRoster: { id: 'roster', picks: [{ entryId: 'lord' }] },
  })
})

it('freezes the alerts this device last read on the offline roster’s unit holding their ability', async () => {
  prepare(80, 1, [
    { key: 'datasheet:charge', ability: 'Charge', description: '', timings: [{ moment: 'turn-start', phase: null, turn: 'your-turn' }] },
  ])
  await attach()
  expect(mocks.queue.mock.calls[0]?.[1].command.roster.reminders.map((reminder: { key: string }) => reminder.key)).toEqual([
    'datasheet:charge:0',
  ])
})

it('freezes no alerts on a device that never read them', async () => {
  prepare(80)
  await attach()
  expect(mocks.queue.mock.calls[0]?.[1].command.roster.reminders).toEqual([])
})

it('refuses an over-points roster offline before saving a battle command', async () => {
  prepare(1_001)
  await expect(attach()).rejects.toThrow('roster has 1001 points, over its 1000-point limit')
  expect(mocks.queue).not.toHaveBeenCalled()
})

it('refuses a force-wide unit limit violation offline before saving a battle command', async () => {
  prepare(80, 2)
  await expect(attach()).rejects.toThrow('allows at most 1, has 2')
  expect(mocks.queue).not.toHaveBeenCalled()
})

it('keeps the newer battle screen when its full history has not downloaded offline', async () => {
  prepare(80)
  vi.stubGlobal('navigator', { onLine: false })
  await expect(
    submit({ data: { token: 'battle', expectedSeq: 1, command: { kind: 'attach-saved-roster', rosterId: 'roster' } } }),
  ).rejects.toThrow('Reconnect to download the latest battle history before continuing.')
})

function settlement() {
  prepare(80)
  const history = log(...started(), ...turns(6, ALICE))
  mocks.document.mockResolvedValue({ ...workspace, log: history, serverSeq: history.length })
  return { data: { token: 'battle', expectedSeq: history.length, command: { kind: 'settle-opponent-turn' as const } } }
}

it('returns a competing connected automatic settlement as stale without saving a durable conflict', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  const authoritative = { result: { outcome: 'stale', seq: input.data.expectedSeq + 1 }, screen: null }
  mocks.submit.mockResolvedValue(authoritative)
  const result = await submit(input)
  expect({ result, queued: mocks.queue.mock.calls }).toEqual({ result: authoritative, queued: [] })
})

it('saves an offline automatic settlement durably', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: false })
  await submit(input)
  expect(mocks.queue.mock.calls[0]?.[1]).toMatchObject({ expectedSeq: input.data.expectedSeq, command: input.data.command })
})

it('downloads and saves authoritative automatic settlement before showing its screen', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  const fresh = { ...workspace, log: log(...started(), ...turns(6, ALICE), [ALICE, input.data.command]), serverSeq: 10 }
  const screen = { kind: 'battle', view: { seq: 10 } }
  const result = { outcome: 'appended', seq: 10 }
  mocks.submit.mockResolvedValue({ result, screen })
  mocks.workspace.mockResolvedValue({ workspace: fresh, screen })
  const answer = await submit(input)
  expect({ answer, saved: mocks.remember.mock.calls }).toEqual({ answer: { result, screen }, saved: [[fresh, 'alice']] })
})

it('saves the history returned with a connected command without downloading it again', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  const fresh = { ...workspace, log: log(...started(), ...turns(6, ALICE), [ALICE, input.data.command]), serverSeq: 10 }
  const screen = { kind: 'battle', view: { seq: 10 } }
  mocks.submit.mockResolvedValue({ result: { outcome: 'appended', seq: 10 }, screen, workspace: fresh })
  await submit(input)
  expect({ downloads: mocks.workspace.mock.calls.length, saved: mocks.remember.mock.calls }).toEqual({
    downloads: 0,
    saved: [[fresh, 'alice']],
  })
})

it('downloads a saved battle’s history while its screen loads', async () => {
  prepare(80)
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  let answer = (_screen: unknown) => {}
  mocks.open.mockReturnValue(new Promise((resolve) => (answer = resolve)))
  mocks.workspace.mockResolvedValue({ workspace, screen: { kind: 'battle', view: { seq: 0 } } })
  const opened = openBattle({ data: { token: 'battle' } })
  await vi.waitFor(() => expect(mocks.open).toHaveBeenCalled())
  const downloadedFirst = mocks.workspace.mock.calls.length
  answer({ kind: 'battle', view: { seq: 0 } })
  await opened
  expect(downloadedFirst).toBe(1)
})

it('does not show an automatic server advance when its offline history cannot download', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  mocks.submit.mockResolvedValue({ result: { outcome: 'appended', seq: 10 }, screen: { kind: 'battle' } })
  mocks.workspace.mockRejectedValue(new Error('Disconnected before download'))
  await expect(submit(input)).rejects.toThrow('Disconnected before download')
  expect(mocks.queue).not.toHaveBeenCalled()
})

it('preserves a local command saved while an automatic settlement response downloads', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  const history = log(...started(), ...turns(6, ALICE), [ALICE, input.data.command])
  const fresh = { ...workspace, log: history, serverSeq: 10 }
  const current = {
    ...fresh,
    log: log(...started(), ...turns(6, ALICE), [ALICE, input.data.command], [ALICE, { kind: 'advance' }]),
  }
  mocks.changes.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  mocks.submit.mockResolvedValue({ result: { outcome: 'appended', seq: 10 }, screen: { kind: 'battle' } })
  mocks.workspace.mockResolvedValue({ workspace: fresh, screen: { kind: 'battle', view: { seq: 10 } } })
  mocks.document.mockResolvedValue(current)
  const answer = await submit(input)
  expect(answer.screen?.kind === 'battle' && answer.screen.view.seq).toBe(11)
})

it('keeps automatic settlement behind existing local battle work while connected', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  mocks.changes.mockResolvedValue(true)
  await submit(input)
  expect(mocks.queue.mock.calls[0]?.[1]).toMatchObject({ expectedSeq: input.data.expectedSeq, command: input.data.command })
})

it('submits connected automatic settlement authoritatively after pending player work acknowledges', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  let pending = true
  mocks.changes.mockImplementation(async () => pending)
  mocks.sync.mockImplementation(async () => {
    pending = false
  })
  const authoritative = { result: { outcome: 'stale', seq: input.data.expectedSeq + 1 }, screen: null }
  mocks.submit.mockResolvedValue(authoritative)
  const answer = await submit(input)
  expect({ answer, synced: mocks.sync.mock.calls.length, queued: mocks.queue.mock.calls }).toEqual({
    answer: authoritative,
    synced: 1,
    queued: [],
  })
})

it('submits a connected play command to the service without saving it on the device', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  const authoritative = { result: { outcome: 'stale', seq: input.data.expectedSeq + 1 }, screen: null }
  mocks.submit.mockResolvedValue(authoritative)
  const answer = await submit({ data: { ...input.data, command: { kind: 'advance' } } })
  expect({ answer, queued: mocks.queue.mock.calls }).toEqual({ answer: authoritative, queued: [] })
})

it('sends a connected play command without building the device rules', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  mocks.submit.mockResolvedValue({ result: { outcome: 'stale', seq: input.data.expectedSeq + 1 }, screen: null })
  await submit({ data: { ...input.data, command: { kind: 'advance' } } })
  expect(mocks.construction).not.toHaveBeenCalled()
})

it('submits a connected play command to the service while an earlier conflict awaits review', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  mocks.saved.mockResolvedValue(true)
  const authoritative = { result: { outcome: 'stale', seq: input.data.expectedSeq + 1 }, screen: null }
  mocks.submit.mockResolvedValue(authoritative)
  const answer = await submit({ data: { ...input.data, command: { kind: 'advance' } } })
  expect({ answer, queued: mocks.queue.mock.calls }).toEqual({ answer: authoritative, queued: [] })
})

it('does not replay a connected automatic write after an uncertain network response', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  mocks.submit.mockRejectedValue(new Error('Response lost'))
  await expect(submit(input)).rejects.toThrow('Response lost')
  expect(mocks.queue).not.toHaveBeenCalled()
})

it('saves a connected setup choice on the device when the service never answers', async () => {
  prepare(80)
  vi.stubGlobal('navigator', { onLine: true })
  mocks.submit.mockRejectedValue(new TypeError('Load failed'))
  const answer = await submit({ data: { token: 'battle', expectedSeq: 0, command: { kind: 'set-attacker', attackerId: 'bob' } } })
  expect({ outcome: answer.result.outcome, command: mocks.queue.mock.calls[0]?.[1].command }).toEqual({
    outcome: 'appended',
    command: { kind: 'set-attacker', attackerId: 'bob' },
  })
})

it('saves a connected automatic write on the device when the service never answers', async () => {
  const input = settlement()
  vi.stubGlobal('navigator', { onLine: true })
  mocks.submit.mockRejectedValue(new TypeError('Failed to fetch'))
  await submit(input)
  expect(mocks.queue).toHaveBeenCalledOnce()
})

it('returns a competing connected defender choice without retaining a durable conflict', async () => {
  prepare(80)
  vi.stubGlobal('navigator', { onLine: true })
  const input = { data: { token: 'battle', expectedSeq: 0, command: { kind: 'set-attacker' as const, attackerId: 'bob' } } }
  const authoritative = { result: { outcome: 'stale', seq: 1 }, screen: null }
  mocks.submit.mockResolvedValue(authoritative)
  const answer = await submit(input)
  expect({ answer, writes: mocks.submit.mock.calls, queued: mocks.queue.mock.calls }).toEqual({
    answer: authoritative,
    writes: [[{ data: { ...input.data, workspace: true } }]],
    queued: [],
  })
})

it('keeps a connected setup choice behind pending offline history', async () => {
  prepare(80)
  vi.stubGlobal('navigator', { onLine: true })
  mocks.changes.mockResolvedValue(true)
  await submit({ data: { token: 'battle', expectedSeq: 0, command: { kind: 'set-attacker', attackerId: 'bob' } } })
  expect({ sent: mocks.submit.mock.calls.length, command: mocks.queue.mock.calls[0]?.[1].command }).toEqual({
    sent: 0,
    command: { kind: 'set-attacker', attackerId: 'bob' },
  })
})

it('downloads the winning setup history before displaying a competing defender choice', async () => {
  prepare(80)
  vi.stubGlobal('navigator', { onLine: true })
  const command = { kind: 'set-attacker' as const, attackerId: 'bob' }
  const fresh = { ...workspace, log: log([ALICE, command]), serverSeq: 1 }
  const screen = { kind: 'battle', view: { seq: 1 } }
  const result = { outcome: 'stale', seq: 1 }
  mocks.submit.mockResolvedValue({ result, screen })
  mocks.workspace.mockResolvedValue({ workspace: fresh, screen })
  const answer = await submit({ data: { token: 'battle', expectedSeq: 0, command } })
  expect({ answer, saved: mocks.remember.mock.calls, queued: mocks.queue.mock.calls }).toEqual({
    answer: { result, screen },
    saved: [[fresh, 'alice']],
    queued: [],
  })
})

it('does not replay a connected setup choice after an uncertain response', async () => {
  prepare(80)
  vi.stubGlobal('navigator', { onLine: true })
  mocks.submit.mockRejectedValue(new Error('Response lost'))
  await expect(submit({ data: { token: 'battle', expectedSeq: 0, command: { kind: 'set-attacker', attackerId: 'bob' } } })).rejects.toThrow(
    'Response lost',
  )
  expect(mocks.queue).not.toHaveBeenCalled()
})
