import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SimulatorSide } from '../../../contracts/simulatorState'
import type { RosterPick } from '../../../core/roster'
import { rosterCombatant } from '../../../shared/rosterCombatRules'
import { preferenceBook } from '../../../server/combatPreferences.fixtures'
import { type CombatRoster, useCombatant } from './useCombatant'
import { useLoadoutOptimizer } from './useLoadoutOptimizer'
import { optimizeLoadout } from '../../../core/combatLoadouts'
import { combatMatchup } from '../../../core/combatMatchup'
import { combatAttacks } from '../../../core/combatScenario'

const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  dependencies: [] as (readonly unknown[] | undefined)[],
  effects: [] as (() => void)[],
  loading: false,
  settled: null as readonly RosterPick[] | null,
  changes: 0,
  sheets: vi.fn(),
  optimization: null as unknown,
  stream: vi.fn(),
  worker: vi.fn(),
}))
vi.mock('../../functions', async (actual) => ({
  ...(await actual<typeof import('../../functions')>()),
  loadoutSearch: async () => hooks.stream(),
}))
vi.mock('./combatWorker', () => ({
  default: function CombatWorker() {
    return hooks.worker()
  },
}))
vi.mock('react', () => ({
  useContext: () => hooks.optimization,
  createContext: () => ({}),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial
    return [
      hooks.slots[index],
      (update: unknown) => {
        const previous = hooks.slots[index]
        const next = typeof update === 'function' ? update(previous) : update
        if (!Object.is(previous, next)) hooks.changes++
        hooks.slots[index] = next
      },
    ]
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++
    return (hooks.slots[index] ??= { current: initial })
  },
  useMemo: (factory: () => unknown, dependencies: readonly unknown[]) => {
    const index = hooks.cursor++
    if (!hooks.dependencies[index] || dependencies.some((value, at) => !Object.is(value, hooks.dependencies[index]![at]))) {
      hooks.slots[index] = factory()
      hooks.dependencies[index] = dependencies
    }
    return hooks.slots[index]
  },
  useCallback: (callback: unknown) => callback,
  // Layout effects finish before any passive effect or event handler can run, so the double runs them at once.
  useLayoutEffect: (effect: () => void, dependencies: readonly unknown[]) => {
    const index = hooks.cursor++
    if (!hooks.dependencies[index] || dependencies.some((value, at) => !Object.is(value, hooks.dependencies[index]![at]))) {
      effect()
      hooks.dependencies[index] = dependencies
    }
  },
  useEffect: (effect: () => void, dependencies: readonly unknown[]) => {
    const index = hooks.cursor++
    if (!hooks.dependencies[index] || dependencies.some((value, at) => !Object.is(value, hooks.dependencies[index]![at]))) {
      hooks.effects.push(effect)
      hooks.dependencies[index] = dependencies
    }
  },
}))
vi.mock('../../queries', () => ({
  priceQuery: (...args: unknown[]) => ({ kind: 'price', args }),
  combatantDatasheetQuery: (...args: unknown[]) => ({ kind: 'sheets', args }),
  combatLoadoutsQuery: () => ({ kind: 'loadouts' }),
  factionQuery: () => ({ kind: 'faction' }),
}))
vi.mock('../../useSettled', () => ({ useSettled: (picks: readonly RosterPick[]) => hooks.settled ?? picks }))
// Rules here carry their words, so nothing needs loading.
vi.mock('../../sourceText', () => ({ useSourceTexts: () => ({ chosen: false, loaded: 0 }), loadedWords: (text: string) => text }))
vi.mock('@tanstack/react-query', async (actual) => ({
  replaceEqualDeep: (await actual<typeof import('@tanstack/react-query')>()).replaceEqualDeep,
  useQuery: ({ kind, args }: { kind: string; args: unknown[] }) => ({
    data:
      kind === 'price'
        ? { units: (args[4] as RosterPick[]).map((pick) => ({ entryId: pick.entryId, size: { models: 1 } })) }
        : kind === 'sheets'
          ? hooks.sheets({ catalogueId: args[0], detachmentIds: args[2], picks: args[3], pickIndex: args[4] })
          : undefined,
    isFetching: hooks.loading,
    isPlaceholderData: false,
    isError: false,
  }),
}))

const initial: SimulatorSide = {
  catalogueId: 'cat',
  pick: { entryId: 'squad' },
  rules: {},
  attached: [{ entryId: 'leader' }, { entryId: 'support' }],
  preferences: { 'attached:2:ranged:0:plasma': 'attached:2:support-spread' },
}
function render(side = initial) {
  hooks.cursor = 0
  hooks.effects = []
  const combatant = useCombatant(undefined, side)
  return { ...combatant, settle: () => hooks.effects.forEach((effect) => effect()) }
}
function battleRoster(pickIndex: number, units: { models: number; available?: boolean }[]): CombatRoster {
  return {
    catalogueId: 'cat',
    detachmentIds: [],
    disposition: null,
    limit: 2000,
    picks: [{ entryId: 'squad' }, { entryId: 'leader' }],
    pickIndex,
    waivedRules: [],
    borrowedDetachmentId: null,
    optionalRules: [],
    battle: {
      units: units.map(({ models, available = true }, index) => ({
        available,
        key: String(index),
        name: String(index),
        models,
        startingModels: 5,
        damage: 0,
      })),
    },
  }
}
function renderBattle(roster: CombatRoster) {
  hooks.cursor = 0
  hooks.effects = []
  return useCombatant(roster)
}
beforeEach(() => {
  hooks.slots = []
  hooks.dependencies = []
  hooks.loading = false
  hooks.settled = null
  hooks.changes = 0
  const book = preferenceBook()
  hooks.sheets.mockImplementation((data) => rosterCombatant(book, null, data))
})

describe('a link with a unit joined to an attached unit', () => {
  const chained: SimulatorSide = { ...initial, attached: [{ entryId: 'leader' }, { entryId: 'support', attachedTo: 1 }], preferences: {} }

  it('joins it to that attached unit', () => {
    expect(render(chained).picks.positioned.map((pick) => pick.attachedTo)).toEqual([undefined, 0, 1])
  })

  it('shares it joined to that attached unit', () => {
    expect(render(chained).shared?.attached).toEqual(chained.attached)
  })
})

it("fields a shared link's detachment and shares it again", () => {
  expect(render({ ...initial, detachmentIds: ['vanguard'] }).shared?.detachmentIds).toEqual(['vanguard'])
})

it('fields a chosen detachment', () => {
  render().selectDetachments(['vanguard'])
  render()
  expect(hooks.sheets).toHaveBeenLastCalledWith(expect.objectContaining({ detachmentIds: ['vanguard'] }))
})

it("leaves a chosen detachment behind for another faction's unit", () => {
  render().selectDetachments(['vanguard'])
  render().selectUnit('other', 'squad')
  expect(render().detachmentIds).toEqual([])
})

it('retains version-one preferences while the selected sheets are loading', () => {
  hooks.loading = true
  const waiting = render()
  waiting.setWeaponPreferences({})
  waiting.settle()
  expect(render().weaponPreferences).toEqual(initial.preferences)
})

it('seeds shared choices only when real profile metadata is ready', () => {
  hooks.loading = true
  render().settle()
  hooks.loading = false
  render().settle()
  const ready = render()
  ready.removeMember(1)
  render().settle()
  expect(render().weaponPreferences).toEqual({ 'attached:1:ranged:0:plasma': 'attached:1:support-spread' })
})

it('retains a surviving companion’s choice when the host is removed', () => {
  render().settle()
  render().removeMember(0)
  render().settle()
  render().removeMember(0)
  render().settle()
  expect(render().weaponPreferences).toEqual({ 'ranged:0:plasma': 'support-spread' })
})

it('cannot overwrite remapped choices through a callback from the previous membership', () => {
  render().settle()
  const before = render()
  before.removeMember(1)
  render().settle()
  before.setWeaponPreferences({})
  expect(render().weaponPreferences).toEqual({ 'attached:1:ranged:0:plasma': 'attached:1:support-spread' })
})

it('cannot write a stale ready callback while an edit is unsettled', () => {
  render().settle()
  const before = render()
  hooks.loading = true
  render()
  before.setWeaponPreferences({})
  expect(render().weaponPreferences).toEqual(initial.preferences)
})

it('repeated identical settings keep the same stored state', () => {
  render().settle()
  const ready = render()
  const before = hooks.changes
  ready.setWeaponPreferences(ready.weaponPreferences)
  render().settle()
  render().setWeaponPreferences(ready.weaponPreferences)
  expect(hooks.changes).toBe(before)
})

it('flags choices tied to equipment profiles which are no longer present', () => {
  render().settle()
  const original = hooks.sheets.getMockImplementation()!
  hooks.sheets.mockImplementation((data) => {
    const sheet = original(data) as ReturnType<typeof rosterCombatant>
    return (
      sheet && {
        ...sheet,
        companions: sheet.companions.map((member) => ({
          ...member,
          selected: { ...member.selected, profiles: member.selected.profiles.filter((profile) => !profile.id.endsWith('support-spread')) },
        })),
      }
    )
  })
  const changed = render()
  expect({ preferences: changed.weaponPreferences, invalidated: changed.invalidatedPreferences }).toEqual({
    preferences: {},
    invalidated: true,
  })
})

it('retains remapped choices while old companion sheets are placeholders during removal', () => {
  render().settle()
  const previous = render()
  const projected = hooks.sheets.getMockImplementation()!({
    catalogueId: 'cat',
    detachmentIds: [],
    picks: previous.picks.positioned,
    pickIndex: 0,
  })
  previous.removeMember(1)
  hooks.loading = true
  hooks.sheets.mockReturnValue(projected)
  expect(render().weaponPreferences).toEqual({ 'attached:1:ranged:0:plasma': 'attached:1:support-spread' })
})

it.each(['complete', 'cancel'])('retains an optimized profile after %s when a preceding member is later removed', async (ending) => {
  const book = preferenceBook(true)
  hooks.sheets.mockImplementation((data) => rosterCombatant(book, null, data))
  const before = render({ ...initial, preferences: {} })
  before.settle()
  const ready = render()
  const nextPicks = ready.picks.positioned.map((pick, index) => (index === 2 ? { ...pick, choices: { 'support-weapon': 'plasma' } } : pick))
  const next = rosterCombatant(book, null, { catalogueId: 'cat', detachmentIds: [], picks: nextPicks, pickIndex: 0 })!
  const defender = rosterCombatant(book, null, { catalogueId: 'cat', detachmentIds: [], picks: [{ entryId: 'squad' }], pickIndex: 0 })!
  const matchup = combatMatchup(
    ready.snapshot,
    { sheet: defender.selected, carriers: defender.carriers, models: 1 },
    { preferences: {}, excluded: { ranged: [], melee: [] }, allocation: [] },
  )
  const scoring = {
    sheet: ready.snapshot!.sheet,
    carriers: ready.snapshot!.carriers,
    models: 1,
    rules: [],
    companions: ready.snapshot!.companions,
    preferences: {},
    excluded: { ranged: [], melee: [] },
    opponent: { keywords: [], rules: [] },
    phases: { ranged: matchup.phaseSetup('ranged', {}), melee: matchup.phaseSetup('melee', {}) },
  }
  const candidate = {
    members: [{ ...next, pickIndex: 0 }, ...next.companions].map((member) => ({
      pickIndex: member.pickIndex,
      pick: nextPicks[member.pickIndex]!,
      sheet: member.selected,
      carriers: member.carriers,
      models: member.models,
      rules: member.rules,
    })),
  }
  hooks.optimization = {
    key: 'current-matchup',
    scoring,
    preferences: {},
    excluded: { ranged: [], melee: [] },
    expected: { ranged: matchup.scenario('ranged', {}), melee: matchup.scenario('melee', {}) },
    apply: ready.setWeaponPreferences,
  }
  let finish = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(output) {
      output.enqueue(
        new TextEncoder().encode(JSON.stringify({ candidates: [candidate], built: 1, scheduled: 1, done: ending === 'complete' }) + '\n'),
      )
      finish = () => output.close()
      if (ending === 'complete') finish()
    },
  })
  hooks.stream.mockReturnValue(new Response(stream))
  let scored = () => {}
  const scoringFinished = new Promise<void>((resolve) => {
    scored = resolve
  })
  hooks.worker.mockImplementation(() => {
    const worker = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null,
      terminate: vi.fn(),
      postMessage: (request: Parameters<typeof optimizeLoadout>[0] & { space: Parameters<typeof optimizeLoadout>[0] }) => {
        const optimized = optimizeLoadout(request.space, scoring)
        queueMicrotask(() => {
          worker.onmessage!(new MessageEvent('message', { data: { optimized } }))
          scored()
        })
      },
    }
    return worker
  })
  vi.stubGlobal('navigator', { hardwareConcurrency: 1 })
  try {
    const optimizer = useLoadoutOptimizer(ready)
    const searching = optimizer.optimize()
    await scoringFinished
    if (ending === 'cancel') {
      await new Promise<void>((resolve) => setImmediate(resolve))
      optimizer.cancel()
      finish()
    }
    await searching
    render().settle()
    const optimized = render()
    optimized.removeMember(1)
    render().settle()
    const remaining = render()
    const attack = combatAttacks(remaining.snapshot!, { keywords: [], rules: [] }, remaining.weaponPreferences, { ranged: [], melee: [] })
    expect({
      previousHadProfile: ready.snapshot!.companions[1]!.sheet.profiles.some((profile) => profile.id === 'attached:2:support-spread'),
      newHadProfile: optimized.snapshot!.companions[1]!.sheet.profiles.some((profile) => profile.id === 'attached:2:support-spread'),
      preferences: remaining.weaponPreferences,
      weapons: attack.ranged.plan.used.map((entry) => [entry.profile.id, entry.weapon?.damage.bonus]),
    }).toEqual({
      previousHadProfile: false,
      newHadProfile: true,
      preferences: { 'attached:1:ranged:0:plasma': 'attached:1:support-spread' },
      weapons: [['attached:1:support-spread', 3]],
    })
  } finally {
    vi.unstubAllGlobals()
  }
})

it('does not restore a discarded choice when normalization runs after the child’s settings effect', () => {
  const ready = render()
  ready.setWeaponPreferences({})
  ready.settle()
  expect(render().weaponPreferences).toEqual({})
})

it('follows the battle to a surviving unit when the selected unit is destroyed', () => {
  renderBattle(battleRoster(1, [{ models: 5 }, { models: 1 }]))
  expect(renderBattle(battleRoster(0, [{ models: 5 }, { models: 0, available: false }])).pickIndex).toBe(0)
})

it('a live casualty replaces the casualty count set in the simulator', () => {
  renderBattle(battleRoster(0, [{ models: 5 }, { models: 1 }])).setHealth({ models: 3 })
  expect(renderBattle(battleRoster(0, [{ models: 4 }, { models: 1 }])).models).toBe(4)
})

it('keeps the casualty count set in the simulator while the battle is unchanged', () => {
  renderBattle(battleRoster(0, [{ models: 5 }, { models: 1 }])).setHealth({ models: 3 })
  expect(renderBattle(battleRoster(0, [{ models: 5 }, { models: 1 }])).models).toBe(3)
})

it('detaches a leader the battle reports destroyed', () => {
  const attached = (leader: RosterPick) => ({
    ...battleRoster(0, [{ models: 5 }, { models: leader.attachedTo === undefined ? 0 : 1 }]),
    picks: [{ entryId: 'squad' }, leader],
  })
  renderBattle(attached({ entryId: 'leader', attachedTo: 0 }))
  hooks.effects.forEach((effect) => effect())
  renderBattle(attached({ entryId: 'leader' }))
  hooks.effects.forEach((effect) => effect())
  expect(renderBattle(attached({ entryId: 'leader' })).picks.positioned[1]?.attachedTo).toBeUndefined()
})

function savedRoster(pickIndex: number): CombatRoster {
  return {
    catalogueId: 'cat',
    detachmentIds: ['detachment'],
    disposition: null,
    limit: 2000,
    picks: [{ entryId: 'squad' }, { entryId: 'leader', note: 'Hold the left flank' }],
    pickIndex,
    waivedRules: [],
    borrowedDetachmentId: null,
    optionalRules: [],
    saved: { source: { id: 'roster-1' }, name: 'Court of the Ankh' },
  }
}

it('shares a saved roster’s unit by roster and position, without its note', () => {
  expect(renderBattle(savedRoster(1)).shared).toEqual({
    catalogueId: 'cat',
    pick: { entryId: 'leader' },
    rules: {},
    roster: { id: 'roster-1', pickIndex: 1 },
  })
})

it('shares a revealed league list’s unit by event, entrant and position', () => {
  const league = { token: 'league-1', eventToken: 'event-1', userId: 'friend-1' }
  expect(renderBattle({ ...savedRoster(1), saved: { source: { league }, name: 'Sealed' } }).shared?.roster).toEqual({
    league,
    pickIndex: 1,
  })
})

it('shares nothing for a roster that was never saved', () => {
  expect(renderBattle({ ...savedRoster(1), saved: undefined }).shared).toBeNull()
})

it('restores rule choices to the saved roster unit the link names', () => {
  hooks.cursor = 0
  const side: SimulatorSide = {
    catalogueId: 'cat',
    pick: { entryId: 'leader' },
    rules: { command: 2 },
    roster: { id: 'roster-1', pickIndex: 1 },
  }
  expect(useCombatant(savedRoster(1), side).ruleSelections).toEqual({ command: 2 })
})
