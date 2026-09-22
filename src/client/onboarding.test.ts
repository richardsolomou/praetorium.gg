import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onboardingTaskIds } from '../core/onboarding'
import {
  FIRST_ONBOARDING_STEP,
  focusAfterOnboardingNavigation,
  focusAfterOnboardingOperation,
  nextOnboardingFocus,
  onboardingFocusStorageKey,
  onboardingHrefFor,
  onboardingPage,
  onboardingPromptAtTop,
  onboardingStepEntry,
  onboardingStepIds,
  onboardingStepPastAbsentTarget,
  onboardingTargets,
  onboardingTasks,
  ONBOARDING_UI,
  storedOnboardingFocus,
  type OnboardingStepId,
} from './onboarding'

/** One address per page the guide can name, which is also what proves a step's page is reachable. */
const PAGE_ADDRESSES = [
  ['/rosters', 'rosters'],
  ['/rosters/', 'rosters'],
  ['/rosters/a-roster', 'roster'],
  ['/rosters/a-roster/', 'roster'],
  ['/friends', 'friends'],
  ['/battles', 'battles'],
  ['/battles/a-token', undefined],
  ['/', 'home'],
  ['/leagues', 'leagues'],
  ['/leagues/', 'leagues'],
  ['/leagues/a-league', 'league'],
  ['/factions', 'factions'],
  ['/factions/orks', 'faction'],
  ['/factions/orks/detachments/awakened-dynasty', 'detachment'],
  ['/factions/orks/datasheets', 'datasheets'],
  ['/factions/orks/datasheets/boyz', 'datasheet'],
  ['/mission-packs/pack', 'missions'],
  ['/mission-matchups/pack/you/opponent', 'mission'],
  ['/leaderboard', 'leaderboard'],
  ['/rules', 'rules'],
  ['/rules/core-rules', 'rule-document'],
  ['/rules/core-rules/movement', 'rule-section'],
  ['/users/a-player', 'player'],
  ['/profile', 'profile'],
] as const

describe('onboarding page', () => {
  it.each(PAGE_ADDRESSES)('maps %s to %s', (path, page) => {
    expect(onboardingPage(path)).toBe(page)
  })
})

describe('onboarding tasks', () => {
  it('offers one task for every area the account can make progress in', () => {
    expect(onboardingTasks.map((task) => task.id)).toEqual(onboardingTaskIds)
  })

  it('starts a tour for every task', () => {
    expect(Object.keys(FIRST_ONBOARDING_STEP)).toEqual(onboardingTaskIds)
  })
})

describe('onboarding steps', () => {
  it.each(onboardingTaskIds)('walks %s from its first step to a finish', (task) => {
    const walked: OnboardingStepId[] = []
    let step: OnboardingStepId | undefined = FIRST_ONBOARDING_STEP[task]
    while (step && !walked.includes(step)) {
      expect(ONBOARDING_UI[step].task).toBe(task)
      walked.push(step)
      step = ONBOARDING_UI[step].next
    }
    expect(walked.map((id) => ONBOARDING_UI[id].final === true)).toEqual(walked.map((_, index) => index === walked.length - 1))
  })

  it('belongs to a walk from some task, so no step is unreachable', () => {
    const reachable = new Set<OnboardingStepId>()
    for (const task of onboardingTaskIds) {
      let step: OnboardingStepId | undefined = FIRST_ONBOARDING_STEP[task]
      while (step && !reachable.has(step)) {
        reachable.add(step)
        step = ONBOARDING_UI[step].next
      }
    }
    expect([...reachable].toSorted()).toEqual([...onboardingStepIds].toSorted())
  })

  const producedPages = new Set(PAGE_ADDRESSES.map(([path]) => onboardingPage(path)))

  it.each(onboardingStepIds)('waits for %s on a page an address produces', (step) => {
    expect(producedPages.has(ONBOARDING_UI[step].page)).toBe(true)
  })

  it.each(onboardingStepIds)('sends the player to %s through an address the guide understands', (step) => {
    expect(onboardingPage(ONBOARDING_UI[step].href)).toBeDefined()
  })

  it('only offers to take the player on where the next step is already open or its address reaches it', () => {
    const jumps = Object.values(ONBOARDING_UI).flatMap((step) =>
      step.nextLabel && step.next ? [{ from: step, to: ONBOARDING_UI[step.next] }] : [],
    )
    expect(jumps.filter(({ from, to }) => to.page !== from.page && onboardingPage(to.href) !== to.page)).toEqual([])
  })

  it('leaves a step that can be absent somewhere to go', () => {
    expect(Object.values(ONBOARDING_UI).filter((step) => step.optional && !step.next)).toEqual([])
  })

  it('hands a step that can be absent on to one its own page holds', () => {
    const skips = Object.values(ONBOARDING_UI).flatMap((step) => (step.optional && step.next ? [[step, ONBOARDING_UI[step.next]]] : []))
    expect(skips.filter(([step, next]) => next?.page !== step?.page && onboardingPage(next?.href ?? '') !== next?.page)).toEqual([])
  })

  it('steps over a control the data need not produce', () => {
    expect(onboardingStepPastAbsentTarget('reference-datasheet-weapons')).toBe('reference-datasheet-abilities')
  })

  it('strands a step whose control the screen always draws, rather than skipping it', () => {
    expect(onboardingStepPastAbsentTarget('reference-datasheet-keywords')).toBeUndefined()
  })

  it('moves the compact prompt out of the way of a control at the foot of the screen', () => {
    expect(onboardingPromptAtTop(800, 844)).toBe(true)
  })

  it('leaves the compact prompt at the foot of the screen for a control above it', () => {
    expect(onboardingPromptAtTop(200, 844)).toBe(false)
  })

  it('leaves the compact prompt where it is when no control was found', () => {
    expect(onboardingPromptAtTop(undefined, 844)).toBe(false)
  })

  it('sends a player who is already reading the step’s page nowhere', () => {
    expect(onboardingHrefFor('roster-search', 'roster')).toBeUndefined()
  })

  it('sends a player on another page to the step’s address', () => {
    expect(onboardingHrefFor('roster-search', 'factions')).toBe('/rosters')
  })

  it('sends a step whose control is nowhere back to the last address that reaches its task', () => {
    expect(onboardingStepEntry('reference-datasheet-weapons')).toBe('reference-faction-entry')
  })

  it('leaves a step its own address reaches where it is', () => {
    expect(onboardingStepEntry('community-leaderboard')).toBe('community-leaderboard')
  })

  it('walks the community tour outwards from the reader', () => {
    const community = Object.values(ONBOARDING_UI).filter((step) => step.task === 'community')
    expect([...new Set(community.map((step) => step.page))]).toEqual(['home', 'leaderboard', 'player', 'profile'])
  })

  it('gives every step a control of its own, so no prompt describes a whole screen', () => {
    const steps = Object.values(ONBOARDING_UI)
    const shared = onboardingTargets.filter((target) => steps.filter((step) => step.target === target).length !== 1)
    expect(shared).toEqual([])
  })
})

/** Every `advanceOnboarding` a screen makes, as the `from->to` edge it claims to walk. */
function advancesInSource() {
  return new Set(
    [...readSource().matchAll(/advanceOnboarding\('[a-z]+', '([a-z-]+)', '([a-z-]+)'\)/g)].map((match) => `${match[1]}->${match[2]}`),
  )
}

/** Every marker a screen writes, so a renamed target cannot silently point the guide at nothing. */
function markersInSource() {
  const found = new Map<string, number>()
  for (const match of readSource().matchAll(/\b(?:data-)?onboarding="([a-z][a-z-]*)"/g)) {
    const marker = match[1] ?? ''
    found.set(marker, (found.get(marker) ?? 0) + 1)
  }
  return found
}

/** Every screen the guide can point at, read once as one string. */
function readSource() {
  const parts: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.tsx')) parts.push(readFileSync(path, 'utf8'))
    }
  }
  walk(join(import.meta.dirname, '.'))
  walk(join(import.meta.dirname, '..', 'routes'))
  return parts.join('\n')
}

describe('onboarding targets', () => {
  const markers = markersInSource()

  it('marks every target a step points at', () => {
    expect([...onboardingTargets].filter((target) => !markers.has(target))).toEqual([])
  })

  it('knows every marker a screen writes', () => {
    expect([...markers.keys()].filter((marker) => !(onboardingTargets as readonly string[]).includes(marker))).toEqual([])
  })

  /**
   * One marker per target, except where one control is drawn in two shapes: the picker
   * a phone opens from its own button, a profile that is one line or a table of them,
   * and weapons split between a ranged table and a melee one.
   */
  it('marks one control per target, except where a screen draws that control two ways', () => {
    expect([...markers].filter(([, count]) => count > 1).toSorted(([left], [right]) => left.localeCompare(right))).toEqual([
      ['datasheet-stats', 2],
      ['datasheet-weapons', 2],
      ['roster-picker', 2],
    ])
  })

  it('moves the guide on from a control that handles its own press', () => {
    const edges = new Set(Object.entries(ONBOARDING_UI).map(([id, step]) => `${id}->${step.next ?? ''}`))
    expect([...advancesInSource()].filter((advance) => !edges.has(advance))).toEqual([])
  })

  it('wires up every step a press rather than an address moves on', () => {
    const pressed = Object.entries(ONBOARDING_UI).filter(
      ([, step]) => step.next && !step.nextLabel && !step.awaitsTask && ONBOARDING_UI[step.next].page === step.page,
    )
    const advances = advancesInSource()
    expect(pressed.filter(([id, step]) => !advances.has(`${id}->${step.next ?? ''}`)).map(([id]) => id)).toEqual([])
  })

  it('points every step at a target', () => {
    expect(Object.values(ONBOARDING_UI).filter((step) => !(onboardingTargets as readonly string[]).includes(step.target))).toEqual([])
  })
})

describe('onboarding focus', () => {
  afterEach(() => vi.unstubAllGlobals())

  const withStoredFocus = (entries: Record<string, string>) => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => entries[key] ?? null })
  }

  it('stores each account focus separately', () => {
    expect(onboardingFocusStorageKey('alice')).not.toBe(onboardingFocusStorageKey('bob'))
  })

  it('reads the step stored for that account', () => {
    withStoredFocus({ [onboardingFocusStorageKey('alice')]: JSON.stringify({ task: 'roster', step: 'roster-picker' }) })
    expect(storedOnboardingFocus('alice')).toEqual({ task: 'roster', step: 'roster-picker' })
  })

  it('ignores a step stored for another account', () => {
    withStoredFocus({ [onboardingFocusStorageKey('alice')]: JSON.stringify({ task: 'roster', step: 'roster-picker' }) })
    expect(storedOnboardingFocus('bob')).toBeUndefined()
  })

  it('ignores a step that does not belong to its task', () => {
    withStoredFocus({ [onboardingFocusStorageKey('alice')]: JSON.stringify({ task: 'friend', step: 'roster-picker' }) })
    expect(storedOnboardingFocus('alice')).toBeUndefined()
  })

  it('ignores storage a different release wrote', () => {
    withStoredFocus({ [onboardingFocusStorageKey('alice')]: '{"task":' })
    expect(storedOnboardingFocus('alice')).toBeUndefined()
  })

  it('advances only the step that is currently focused', () => {
    expect(
      nextOnboardingFocus({ task: 'roster', step: 'roster-picker' }, { task: 'roster', from: 'roster-picker', to: 'roster-list' }),
    ).toEqual({ task: 'roster', step: 'roster-list' })
  })

  it('ignores ordinary actions outside the focused guide step', () => {
    const focus = { task: 'friend', step: 'friend-start' } as const
    expect(nextOnboardingFocus(focus, { task: 'roster', from: 'roster-picker', to: 'roster-list' })).toBe(focus)
  })

  it('moves on when the player reaches the next step’s page', () => {
    expect(focusAfterOnboardingNavigation({ task: 'reference', step: 'reference-faction-entry' }, 'faction')).toEqual({
      task: 'reference',
      step: 'reference-army-rules',
    })
  })

  it('waits for the page it is expecting', () => {
    const focus = { task: 'reference', step: 'reference-faction-entry' } as const
    expect(focusAfterOnboardingNavigation(focus, 'rules')).toBe(focus)
  })

  it('leaves a step whose successor shares its page to the control that opens it', () => {
    const focus = { task: 'league', step: 'league-start' } as const
    expect(focusAfterOnboardingNavigation(focus, 'leagues')).toBe(focus)
  })

  it('clears a focused task when the player skips it', () => {
    expect(focusAfterOnboardingOperation({ task: 'roster', step: 'roster-list' }, { operation: 'skip', task: 'roster' })).toBeUndefined()
  })

  it('preserves focus when the player updates another task', () => {
    const focus = { task: 'roster', step: 'roster-list' } as const
    expect(focusAfterOnboardingOperation(focus, { operation: 'skip', task: 'friend' })).toBe(focus)
  })
})
