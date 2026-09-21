import type { Step } from 'react-joyride'
import type { OnboardingProgressOperation, OnboardingTaskId } from '../core/onboarding'

export const ONBOARDING_EVENT = 'praetorium:onboarding'
export const ONBOARDING_PROGRESS_EVENT = 'praetorium:onboarding-progress'
export const ONBOARDING_ADVANCE_EVENT = 'praetorium:onboarding-advance'

export type OnboardingProgressEvent = { task: OnboardingTaskId; keepGuide?: boolean }
type OnboardingPage = 'rosters' | 'roster' | 'friends' | 'battles'

export const onboardingStepIds = [
  'roster-start',
  'roster-setup',
  'roster-picker',
  'roster-list',
  'roster-loadout',
  'friend-start',
  'battle-start',
  'battle-setup',
] as const

export type OnboardingStepId = (typeof onboardingStepIds)[number]
export type OnboardingFocus = { task: OnboardingTaskId; step: OnboardingStepId }
export type OnboardingAdvanceEvent = { task: OnboardingTaskId; from: OnboardingStepId; to: OnboardingStepId }

type OnboardingStep = {
  task: OnboardingTaskId
  target: string
  page: OnboardingPage
  title: string
  description: string
  placement?: Step['placement']
  final?: boolean
}

export const FIRST_ONBOARDING_STEP: Record<OnboardingTaskId, OnboardingStepId> = {
  roster: 'roster-start',
  friend: 'friend-start',
  battle: 'battle-start',
}

export const ONBOARDING_UI: Record<OnboardingStepId, OnboardingStep> = {
  'roster-start': {
    task: 'roster',
    target: 'create-roster',
    page: 'rosters',
    title: 'Build your first army',
    description: 'Create an editable roster. The next prompts will stay with you through setup and the roster builder.',
    placement: 'bottom-end',
  },
  'roster-setup': {
    task: 'roster',
    target: 'roster-setup',
    page: 'rosters',
    title: 'Set the rules for this roster',
    description: 'Faction chooses the army book. Battle size and detachment decide which units and options the builder offers.',
    placement: 'right',
  },
  'roster-picker': {
    task: 'roster',
    target: 'roster-picker',
    page: 'roster',
    title: 'Add a unit',
    description: 'Search and filter the unit picker, then use Add on any datasheet. On a phone, Add units opens this picker.',
    placement: 'right',
  },
  'roster-list': {
    task: 'roster',
    target: 'roster-list',
    page: 'roster',
    title: 'This is your army',
    description:
      'The roster holds the units you have chosen. Its footer keeps the running points total and flags rules problems. Select your unit to continue.',
    placement: 'left',
  },
  'roster-loadout': {
    task: 'roster',
    target: 'roster-loadout',
    page: 'roster',
    title: 'Shape the unit',
    description: 'The loadout shows model count, wargear, upgrades, and abilities. Legal choices and points update as you make changes.',
    placement: 'left',
    final: true,
  },
  'friend-start': {
    task: 'friend',
    target: 'find-friend',
    page: 'friends',
    title: 'Find another player',
    description: 'Search by their player name and send a request. Friends can start battles together.',
    placement: 'top',
  },
  'battle-start': {
    task: 'battle',
    target: 'create-battle',
    page: 'battles',
    title: 'Open a table',
    description: 'Start a battle when you know who is playing. The next prompt explains how the table is formed.',
    placement: 'bottom-end',
  },
  'battle-setup': {
    task: 'battle',
    target: 'battle-setup',
    page: 'battles',
    title: 'Seat the battle',
    description:
      'Choose the table shape, then fill every seat with a friend or a practice opponent. Game size and missions come next in battle setup.',
    placement: 'left',
  },
}

export function openOnboarding() {
  window.dispatchEvent(new Event(ONBOARDING_EVENT))
}

export function signalOnboardingProgress(task: OnboardingTaskId, keepGuide = false) {
  window.dispatchEvent(new CustomEvent<OnboardingProgressEvent>(ONBOARDING_PROGRESS_EVENT, { detail: { task, keepGuide } }))
}

export function advanceOnboarding(task: OnboardingTaskId, from: OnboardingStepId, to: OnboardingStepId) {
  window.dispatchEvent(new CustomEvent<OnboardingAdvanceEvent>(ONBOARDING_ADVANCE_EVENT, { detail: { task, from, to } }))
}

export function nextOnboardingFocus(focus: OnboardingFocus | undefined, advance: OnboardingAdvanceEvent) {
  if (!focus || focus.task !== advance.task || focus.step !== advance.from) return focus
  return { task: advance.task, step: advance.to } satisfies OnboardingFocus
}

export function focusAfterOnboardingOperation(focus: OnboardingFocus | undefined, operation: OnboardingProgressOperation) {
  return operation.operation === 'skip' && operation.task === focus?.task ? undefined : focus
}

export function onboardingPage(pathname: string): OnboardingPage | undefined {
  if (pathname === '/friends') return 'friends'
  if (pathname === '/rosters' || pathname === '/rosters/') return 'rosters'
  if (/^\/rosters\/[^/]+\/?$/.test(pathname)) return 'roster'
  if (pathname === '/battles' || pathname === '/battles/') return 'battles'
  return undefined
}

export function canOfferOnboardingWelcome(pathname: string) {
  return !['/sign-in', '/reset-password', '/native-auth'].includes(pathname)
}
