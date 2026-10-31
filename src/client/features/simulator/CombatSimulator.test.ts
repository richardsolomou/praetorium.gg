import { beforeEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { CombatMatchup } from './CombatMatchup'
import type { MatchupSettings, SimulatorState } from '../../../contracts/simulatorState'
import { CombatSimulatorMatchup } from './CombatSimulator'
import type { Combatant } from './useCombatant'

const hooks = vi.hoisted(() => ({ cursor: 0, side: 0, slots: [] as unknown[], combatants: [] as Combatant[], initial: vi.fn() }))
const rememberMatchup = vi.fn()
vi.mock('../onboarding/onboarding', async (original) => ({
  ...(await original<typeof import('../onboarding/onboarding')>()),
  advanceOnboarding: vi.fn(),
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? initial() : initial
    return [
      hooks.slots[index],
      (update: unknown) => {
        hooks.slots[index] = typeof update === 'function' ? update(hooks.slots[index]) : update
      },
    ]
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++
    return (hooks.slots[index] ??= { current: initial })
  },
  useCallback: (callback: unknown) => callback,
  // Layout effects finish before any event handler can run, so the double runs them at once.
  useLayoutEffect: (effect: () => void) => effect(),
  useEffect: () => {},
}))
vi.mock('./useCombatant', () => ({
  useCombatant: (_roster: unknown, initial: unknown) => {
    hooks.initial(initial)
    return hooks.combatants[hooks.side++ % 2]
  },
}))

function render(initial?: SimulatorState, source: 'standalone' | 'roster' | 'battle' = 'standalone') {
  hooks.cursor = 0
  hooks.side = 0
  const element = CombatSimulatorMatchup({ initial, source, onRemember: rememberMatchup })
  return element.props as ComponentProps<typeof CombatMatchup>
}
function swap(props: ComponentProps<typeof CombatMatchup>) {
  const card = props.attackerControl as { props: { headingAction: { props: { children: { props: { onClick: () => void } } } } } }
  card.props.headingAction.props.children.props.onClick()
  render()
  return render()
}
const settings: MatchupSettings = {
  adjustments: { all: { hitModifier: 1 } },
  preferences: {},
  excluded: { ranged: [], melee: [] },
  allocation: [],
}

beforeEach(() => {
  hooks.slots = []
  hooks.initial.mockReset()
  rememberMatchup.mockClear()
  hooks.combatants = ['first', 'second'].map(
    (identity) =>
      ({
        identity,
        ready: true,
        snapshot: {},
        weaponPreferences: { [identity]: identity },
        invalidatedPreferences: false,
        pickIndex: 0,
        picks: { positioned: [{ entryId: identity }, { entryId: `${identity}-leader`, attachedTo: 0 }] },
        price: { isError: false, data: { units: [{ name: identity }, { name: `${identity} leader` }] } },
        sheets: { isError: false },
        unit: { name: identity },
        shared: { catalogueId: 'book', pick: { entryId: identity }, rules: {} },
        setWeaponPreferences: vi.fn(),
      }) as unknown as Combatant,
  )
})

it('does not remember a standalone setup whose selected unit is still loading', () => {
  hooks.combatants[0]!.ready = false
  render().onCompleted!()
  expect(rememberMatchup).not.toHaveBeenCalled()
})

it('remembers a completed standalone pairing with its shareable choices', () => {
  render().onCompleted!()
  expect(rememberMatchup).toHaveBeenCalledWith({
    shared: expect.any(String),
    attacker: 'first + first leader',
    defender: 'second + second leader',
  })
})

it('keeps each side’s weapon choices through swapping twice', () => {
  const first = render()
  const second = swap(first)
  const restored = swap(second)
  expect([first.preferences, second.preferences, restored.preferences]).toEqual([
    { first: 'first' },
    { second: 'second' },
    { first: 'first' },
  ])
})

it('ignores settings reported by a previously active side', () => {
  const first = render()
  const second = swap(first)
  second.onSettingsChange!(settings)
  first.onSettingsChange!({ ...settings, adjustments: {} })
  expect(render().initialSettings?.adjustments).toEqual(settings.adjustments)
})

it('does not write weapon choices again while reporting matchup settings', () => {
  render().onSettingsChange!(settings)
  expect(hooks.combatants[0]!.setWeaponPreferences).not.toHaveBeenCalled()
})

it('restores legacy version-one matchup preferences onto its attacking side', () => {
  const side = { catalogueId: 'book', pick: { entryId: 'unit' }, rules: {} }
  render({ v: 1, swapped: true, sides: [side, side], matchup: { ...settings, preferences: { mode: 'chosen' } } })
  expect(hooks.initial.mock.calls.map(([initial]) => initial?.preferences)).toEqual([undefined, { mode: 'chosen' }])
})

it('keeps explicit shared-side preferences ahead of legacy matchup preferences', () => {
  const side = { catalogueId: 'book', pick: { entryId: 'unit' }, rules: {}, preferences: { mode: 'side' } }
  render({ v: 1, swapped: false, sides: [side, null], matchup: { ...settings, preferences: { mode: 'legacy' } } })
  expect(hooks.initial.mock.calls[0]?.[0]?.preferences).toEqual({ mode: 'side' })
})

it('treats explicitly empty shared-side choices as authoritative over legacy matchup choices', () => {
  const side = { catalogueId: 'book', pick: { entryId: 'unit' }, rules: {}, preferences: {} }
  render({ v: 1, swapped: false, sides: [side, null], matchup: { ...settings, preferences: { mode: 'legacy' } } })
  expect(hooks.initial.mock.calls[0]?.[0]?.preferences).toEqual({})
})

it('keeps callbacks assigned to their owning side when identical unit identities swap', () => {
  hooks.combatants.forEach((combatant) => {
    combatant.identity = 'cat:0:same-unit'
  })
  const first = render()
  const second = swap(first)
  second.onSettingsChange!(settings)
  first.onSettingsChange!({ ...settings, adjustments: {} })
  first.onPreferencesChange({ mode: 'old-side' })
  expect({
    current: render().preferences,
    adjustments: render().initialSettings?.adjustments,
    firstWrites: (hooks.combatants[0]!.setWeaponPreferences as ReturnType<typeof vi.fn>).mock.calls,
    secondWrites: (hooks.combatants[1]!.setWeaponPreferences as ReturnType<typeof vi.fn>).mock.calls,
  }).toEqual({ current: { second: 'second' }, adjustments: settings.adjustments, firstWrites: [[{ mode: 'old-side' }]], secondWrites: [] })
})
