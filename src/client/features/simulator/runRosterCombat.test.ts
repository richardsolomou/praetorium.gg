import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { rosterCombatant } from '../../../shared/rosterCombatRules'
import { preferenceBook } from '../../../server/combatPreferences.fixtures'
import { resolveCombatRequest, type CombatAnswer, type CombatRequest } from '../../../core/combatMatchup'
import { runRosterCombat } from './runRosterCombat'
import { clearCombatAnswerCache } from './combatCalculation'
import type { CombatRoster } from './useCombatant'
import type { RosterCombatSummary } from './rosterCombat'
import { clearRosterCombatCache } from './rosterCombatCache'

const mocks = vi.hoisted(() => ({ project: vi.fn(), worker: vi.fn() }))
vi.mock('../../functions', () => ({
  combatantDatasheets: ({ data }: { data: { pickIndices: number[]; picks: { entryId: string }[] } }) =>
    Promise.all(
      data.pickIndices.map((pickIndex) => mocks.project({ data: { ...data, pickIndex, entryId: data.picks[pickIndex]!.entryId } })),
    ),
  calculateCombatBatch: vi.fn(),
}))
vi.mock('./combatWorker', () => ({
  default: function () {
    return mocks.worker()
  },
}))

function worker() {
  return {
    onmessage: null as ((event: MessageEvent<CombatAnswer>) => void) | null,
    onerror: null as (() => void) | null,
    onmessageerror: null as (() => void) | null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  }
}
const roster: CombatRoster = {
  catalogueId: 'cat',
  detachmentIds: [],
  disposition: null,
  limit: 2000,
  picks: [{ entryId: 'squad' }],
  pickIndex: 0,
  waivedRules: [],
  borrowedDetachmentId: null,
  optionalRules: [],
}

beforeEach(() => {
  clearRosterCombatCache()
  clearCombatAnswerCache()
  mocks.project.mockReset().mockImplementation(({ data }) => Promise.resolve(rosterCombatant(preferenceBook(false, 'Leader'), null, data)))
  mocks.worker.mockReset().mockImplementation(() => {
    const current = worker()
    current.postMessage.mockImplementation((request: CombatRequest) =>
      queueMicrotask(() => current.onmessage?.({ data: resolveCombatRequest(request) } as MessageEvent<CombatAnswer>)),
    )
    return current
  })
})
afterEach(() => vi.useRealTimers())

function cachedComparison(overrides: Partial<Parameters<typeof runRosterCombat>[0]> = {}) {
  return runRosterCombat({
    attacker: { ...roster, picks: [{ entryId: 'support' }] },
    defender: roster,
    signal: new AbortController().signal,
    onPrepared: () => {},
    onResult: () => {},
    ...overrides,
  })
}

it('does not project rosters to restore an empty comparison cache', async () => {
  await cachedComparison({ cachedOnly: true })
  expect(mocks.project).not.toHaveBeenCalled()
})

it('restores a completed comparison after fresh projections without starting scoring workers', async () => {
  const original = vi.fn()
  await cachedComparison({ onResult: original })
  mocks.worker.mockClear()
  mocks.project.mockClear()
  const restored = vi.fn()
  await cachedComparison({ cachedOnly: true, onResult: restored })
  expect({ workers: mocks.worker.mock.calls.length, projections: mocks.project.mock.calls.length, results: restored.mock.calls }).toEqual({
    workers: 0,
    projections: 2,
    results: original.mock.calls,
  })
})

it('reuses completed pairings when a comparison is run again', async () => {
  await cachedComparison()
  mocks.worker.mockClear()
  await cachedComparison()
  expect(mocks.worker).not.toHaveBeenCalled()
})

it('does not calculate or publish a cache miss while restoring', async () => {
  const onPrepared = vi.fn()
  await cachedComparison({ cachedOnly: true, onPrepared })
  expect({ workers: mocks.worker.mock.calls.length, prepared: onPrepared.mock.calls.length }).toEqual({ workers: 0, prepared: 0 })
})

it('invalidates cached results when current wounds change', async () => {
  await cachedComparison()
  const onResult = vi.fn()
  await cachedComparison({
    cachedOnly: true,
    defender: {
      ...roster,
      battle: { units: [{ key: '0-squad', name: 'Squad', models: 1, startingModels: 1, damage: 1, available: true }] },
    },
    onResult,
  })
  expect(onResult).not.toHaveBeenCalled()
})

it('reuses attacks when changed equipment resolves to the same calculation', async () => {
  mocks.project.mockImplementation(({ data }) => Promise.resolve(rosterCombatant(preferenceBook(true, 'Leader'), null, data)))
  await cachedComparison({ attacker: { ...roster, picks: [{ entryId: 'support', choices: { 'support-weapon': 'staff' } }] } })
  mocks.worker.mockClear()
  await cachedComparison({ attacker: { ...roster, picks: [{ entryId: 'support', choices: { 'support-weapon': 'plasma' } }] } })
  expect(mocks.worker).not.toHaveBeenCalled()
})

it('does not reuse outgoing damage for the reversed matchup', async () => {
  await cachedComparison()
  const onResult = vi.fn()
  await cachedComparison({ attacker: roster, defender: { ...roster, picks: [{ entryId: 'support' }] }, onResult })
  expect(onResult.mock.calls[0]![2].ranged.result.meanDamage).toBe(0)
})

it('invalidates cached results when the evaluated rules change with the same roster selections', async () => {
  const original = vi.fn()
  await cachedComparison({ onResult: original })
  mocks.worker.mockClear()
  mocks.project.mockImplementation(({ data }) => {
    const projected = structuredClone(rosterCombatant(preferenceBook(false, 'Leader'), null, data)!)
    for (const profile of projected.selected.profiles) for (const value of profile.values) if (value.name === 'T') value.value = '10'
    return Promise.resolve(projected)
  })
  const onResult = vi.fn()
  await cachedComparison({ onResult })
  expect(mocks.worker).toHaveBeenCalledOnce()
  expect(onResult.mock.calls[0]![2].ranged.result.meanDamage).toBeLessThan(original.mock.calls[0]![2].ranged.result.meanDamage)
})

it('does not cache comparisons with worker failures', async () => {
  mocks.worker.mockImplementationOnce(() => {
    throw new Error('Unavailable')
  })
  await cachedComparison()
  const onResult = vi.fn()
  await cachedComparison({ cachedOnly: true, onResult })
  expect(onResult).not.toHaveBeenCalled()
})

it('does not restore results after a failed permission or projection read', async () => {
  await cachedComparison()
  mocks.project.mockRejectedValue(new Error('Access denied'))
  const onResult = vi.fn()
  await cachedComparison({ cachedOnly: true, onResult })
  expect(onResult).not.toHaveBeenCalled()
})

it('calculates every directional pairing, including repeated entries, with different outcomes', async () => {
  const results: Record<string, RosterCombatSummary> = {}
  await runRosterCombat({
    attacker: { ...roster, picks: [{ entryId: 'squad' }, { entryId: 'support' }] },
    defender: { ...roster, picks: [{ entryId: 'squad' }, { entryId: 'squad' }] },
    signal: new AbortController().signal,
    onPrepared: () => {},
    onResult: (row, column, answer) => {
      results[`${row}:${column}`] = answer
    },
  })
  expect(
    Object.entries(results)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, answer]) => [key, answer.ranged.result!.meanDamage > 0]),
  ).toEqual([
    ['0:0', false],
    ['0:1', false],
    ['1:0', true],
    ['1:1', true],
  ])
})

it('scores repeated directional pairings once and publishes every cell', async () => {
  const results = vi.fn()
  await runRosterCombat({
    attacker: { ...roster, picks: [{ entryId: 'support' }, { entryId: 'support' }] },
    defender: { ...roster, picks: Array.from({ length: 3 }, () => ({ entryId: 'squad' })) },
    signal: new AbortController().signal,
    onPrepared: () => {},
    onResult: results,
  })
  expect({
    scores: mocks.worker.mock.results.flatMap((result) => result.value.postMessage.mock.calls).length,
    cells: results.mock.calls.map(([row, column]) => `${row}:${column}`).sort(),
  }).toEqual({
    scores: 1,
    cells: ['0:0', '0:1', '0:2', '1:0', '1:1', '1:2'],
  })
})

it('reuses unchanged columns after one target changes', async () => {
  await cachedComparison({ defender: [roster, roster] })
  mocks.worker.mockClear()
  await cachedComparison({
    defender: [
      roster,
      { ...roster, battle: { units: [{ key: '0-squad', name: 'Squad', models: 1, startingModels: 1, damage: 1, available: true }] } },
    ],
  })
  expect(mocks.worker.mock.results.flatMap((result) => result.value.postMessage.mock.calls)).toHaveLength(1)
})

it('cancels active scoring and does not publish late answers', async () => {
  const current = worker()
  mocks.worker.mockReturnValue(current)
  const controller = new AbortController()
  const onResult = vi.fn()
  const pending = cachedComparison({ signal: controller.signal, onResult })
  const failed = pending.catch((error) => error)
  await vi.waitFor(() => expect(current.postMessage).toHaveBeenCalled())
  const late = current.onmessage
  controller.abort(new Error('Cancelled'))
  expect(await failed).toEqual(new Error('Cancelled'))
  late?.({ data: { ranged: null, melee: null } } as MessageEvent<CombatAnswer>)
  expect(onResult).not.toHaveBeenCalled()
})

it('stops scoring when publishing a result fails', async () => {
  await expect(
    cachedComparison({
      onResult: () => {
        throw new Error('Result failed')
      },
    }),
  ).rejects.toThrow('Result failed')
  expect(mocks.worker.mock.results[0]!.value.terminate).toHaveBeenCalledOnce()
})

it('retains failed projections as errors for every affected pairing', async () => {
  mocks.project.mockRejectedValueOnce(new Error('Missing rules'))
  const results: RosterCombatSummary[] = []
  await runRosterCombat({
    attacker: roster,
    defender: [roster, roster],
    signal: new AbortController().signal,
    onPrepared: () => {},
    onResult: (_, __, answer) => results.push(answer),
  })
  expect(results.map((answer) => answer.ranged.error)).toEqual(['Missing rules', 'Missing rules'])
})

it('projects each benchmark in its own faction rather than the attacking roster’s faction', async () => {
  const contexts: string[] = []
  mocks.project.mockImplementation(({ data }) => {
    contexts.push(data.catalogueId)
    return Promise.resolve(rosterCombatant(preferenceBook(false, 'Leader'), null, { ...data, catalogueId: 'cat' }))
  })
  await runRosterCombat({
    attacker: roster,
    defender: [
      { ...roster, catalogueId: 'Necrons' },
      { ...roster, catalogueId: 'Marines' },
    ],
    signal: new AbortController().signal,
    onPrepared: () => {},
    onResult: () => {},
  })
  expect(contexts).toEqual(['cat', 'Necrons', 'Marines'])
})

it('reports invalid requested model counts instead of calculating with a silently resized target', async () => {
  const results: RosterCombatSummary[] = []
  await runRosterCombat({
    attacker: roster,
    defender: { ...roster, picks: [{ entryId: 'squad', models: 0 }] },
    signal: new AbortController().signal,
    onPrepared: () => {},
    onResult: (_, __, answer) => results.push(answer),
  })
  expect(results[0]!.ranged.error).toContain('cannot field 0 models')
})

it('uses current wounds and omits unavailable battle units while retaining them as inactive context', async () => {
  const attacker: CombatRoster = {
    ...roster,
    picks: [{ entryId: 'support' }, { entryId: 'squad' }],
    battle: {
      units: [
        { key: '0-support', name: 'Support', models: 1, startingModels: 1, damage: 1, available: true },
        { key: '1-squad', name: 'Squad', models: 0, startingModels: 1, damage: 0, available: false },
      ],
    },
  }
  const defender: CombatRoster = {
    ...roster,
    battle: { units: [{ key: '0-squad', name: 'Squad', models: 1, startingModels: 1, damage: 1, available: true }] },
  }
  const onPrepared = vi.fn()
  const onResult = vi.fn()
  await runRosterCombat({ attacker, defender, signal: new AbortController().signal, onPrepared, onResult })
  expect({
    attackerCount: onPrepared.mock.calls[0]![0].length,
    targetDamage: onPrepared.mock.calls[0]![1][0].snapshot.damage,
    inactive: mocks.project.mock.calls[0]![0].data.inactivePicks,
    kills: onResult.mock.calls[0]![2].ranged.result.meanKills,
  }).toEqual({ attackerCount: 1, targetDamage: 1, inactive: [1], kills: 1 / 9 })
})

it('refuses oversized comparisons before projecting anything', async () => {
  const large = { ...roster, picks: Array.from({ length: 51 }, () => ({ entryId: 'squad' })) }
  await expect(
    runRosterCombat({ attacker: large, defender: large, signal: new AbortController().signal, onPrepared: () => {}, onResult: () => {} }),
  ).rejects.toThrow('2,500')
  expect(mocks.project).not.toHaveBeenCalled()
})

it('does not emit results from a projection that finished after cancellation', async () => {
  const controller = new AbortController()
  mocks.project.mockImplementationOnce(async () => {
    controller.abort(new Error('Cancelled'))
    return null
  })
  const onPrepared = vi.fn()
  await expect(
    runRosterCombat({ attacker: roster, defender: roster, signal: controller.signal, onPrepared, onResult: () => {} }),
  ).rejects.toThrow('Cancelled')
  expect(onPrepared).not.toHaveBeenCalled()
})

it('names whose list a unit comes from when one side fields a pair of rosters', async () => {
  let owners: (string | undefined)[] = []
  await runRosterCombat({
    attacker: [
      { ...roster, picks: [{ entryId: 'squad' }], owner: { name: 'Alice' } },
      { ...roster, picks: [{ entryId: 'squad' }], owner: { name: 'Bob' } },
    ],
    defender: roster,
    signal: new AbortController().signal,
    onPrepared: (attackers) => {
      owners = attackers.map((unit) => unit.owner?.name)
    },
    onResult: () => {},
  })
  expect(owners).toEqual(['Alice', 'Bob'])
})
