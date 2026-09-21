import type { Step } from 'react-joyride'
import { onboardingTasks, type OnboardingProgressOperation, type OnboardingTaskId } from '../core/onboarding'

export const ONBOARDING_EVENT = 'praetorium:onboarding'
export const ONBOARDING_PROGRESS_EVENT = 'praetorium:onboarding-progress'
export const ONBOARDING_ADVANCE_EVENT = 'praetorium:onboarding-advance'

export function onboardingFocusStorageKey(userId: string) {
  return `praetorium:focused-onboarding-step:${userId}`
}

export function storedOnboardingFocus(userId: string): OnboardingFocus | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const stored = JSON.parse(sessionStorage.getItem(onboardingFocusStorageKey(userId)) ?? 'null') as Partial<OnboardingFocus> | null
    const task = onboardingTasks.find((candidate) => candidate.id === stored?.task)?.id
    const step = onboardingStepIds.find((candidate) => candidate === stored?.step)
    return task && step && ONBOARDING_UI[step].task === task ? { task, step } : undefined
  } catch {
    return undefined
  }
}

export function onboardingStepIsFocused(userId: string, task: OnboardingTaskId, step: OnboardingStepId) {
  const focus = storedOnboardingFocus(userId)
  return focus?.task === task && focus.step === step
}

export type OnboardingProgressEvent = { task: OnboardingTaskId; keepGuide?: boolean }
type OnboardingPage =
  | 'home'
  | 'rosters'
  | 'roster'
  | 'friends'
  | 'battles'
  | 'leagues'
  | 'league'
  | 'factions'
  | 'faction'
  | 'datasheets'
  | 'datasheet'
  | 'missions'
  | 'mission'
  | 'leaderboard'
  | 'rules'
  | 'rule-document'
  | 'rule-section'
  | 'profile'

export const onboardingStepIds = [
  'roster-start',
  'roster-setup',
  'roster-picker',
  'roster-list',
  'roster-loadout',
  'friend-start',
  'battle-start',
  'battle-setup',
  'league-start',
  'league-setup',
  'league-workspace',
  'reference-search',
  'reference-factions',
  'reference-faction',
  'reference-datasheets',
  'reference-datasheet',
  'reference-missions',
  'reference-mission',
  'reference-rules',
  'reference-rule-document',
  'reference-rule-section',
  'community-home',
  'community-leaderboard',
  'community-sharing',
] as const

export type OnboardingStepId = (typeof onboardingStepIds)[number]
export type OnboardingFocus = { task: OnboardingTaskId; step: OnboardingStepId }
export type OnboardingAdvanceEvent = { task: OnboardingTaskId; from: OnboardingStepId; to: OnboardingStepId }

type OnboardingStep = {
  task: OnboardingTaskId
  target: string
  page: OnboardingPage
  href: string
  title: string
  description: string
  placement?: Step['placement']
  next?: OnboardingStepId
  nextLabel?: string
  final?: boolean
}

export const FIRST_ONBOARDING_STEP: Record<OnboardingTaskId, OnboardingStepId> = {
  roster: 'roster-start',
  friend: 'friend-start',
  battle: 'battle-start',
  league: 'league-start',
  reference: 'reference-search',
  community: 'community-home',
}

export const ONBOARDING_UI: Record<OnboardingStepId, OnboardingStep> = {
  'roster-start': {
    task: 'roster',
    target: 'create-roster',
    page: 'rosters',
    href: '/rosters',
    title: 'Build your first army',
    description: 'Create an editable roster. The next prompts will stay with you through setup and the roster builder.',
    placement: 'bottom-end',
  },
  'roster-setup': {
    task: 'roster',
    target: 'roster-setup',
    page: 'rosters',
    href: '/rosters',
    title: 'Set the rules for this roster',
    description: 'Faction chooses the army book. Battle size and detachment decide which units and options the builder offers.',
    placement: 'right',
  },
  'roster-picker': {
    task: 'roster',
    target: 'roster-picker',
    page: 'roster',
    href: '/rosters',
    title: 'Add a unit',
    description: 'Search and filter the unit picker, then use Add on any datasheet. On a phone, Add units opens this picker.',
    placement: 'right',
  },
  'roster-list': {
    task: 'roster',
    target: 'roster-list',
    page: 'roster',
    href: '/rosters',
    title: 'This is your army',
    description:
      'The roster holds the units you have chosen. Its footer keeps the running points total and flags rules problems. Select your unit to continue.',
    placement: 'left',
  },
  'roster-loadout': {
    task: 'roster',
    target: 'roster-loadout',
    page: 'roster',
    href: '/rosters',
    title: 'Shape the unit',
    description: 'The loadout shows model count, wargear, upgrades, and abilities. Legal choices and points update as you make changes.',
    placement: 'left',
    final: true,
  },
  'friend-start': {
    task: 'friend',
    target: 'find-friend',
    page: 'friends',
    href: '/friends',
    title: 'Find another player',
    description: 'Search by their player name and send a request. Friends can start battles together.',
    placement: 'top',
  },
  'battle-start': {
    task: 'battle',
    target: 'create-battle',
    page: 'battles',
    href: '/battles',
    title: 'Open a table',
    description: 'Start a battle when you know who is playing. The next prompt explains how the table is formed.',
    placement: 'bottom-end',
  },
  'battle-setup': {
    task: 'battle',
    target: 'battle-setup',
    page: 'battles',
    href: '/battles',
    title: 'Seat the battle',
    description:
      'Choose the table shape, then fill every seat with a friend or a practice opponent. Game size and missions come next in battle setup.',
    placement: 'left',
  },
  'league-start': {
    task: 'league',
    target: 'create-league',
    page: 'leagues',
    href: '/leagues',
    title: 'Start an event',
    description:
      'Create a league for your group, or open a public league below to join someone else. Events collect sealed rosters and reveal them together.',
    placement: 'bottom-end',
  },
  'league-setup': {
    task: 'league',
    target: 'league-setup',
    page: 'leagues',
    href: '/leagues',
    title: 'Set the registration rules',
    description: 'Choose who can find the league, whether entrants need approval, and an optional player limit.',
    placement: 'left',
  },
  'league-workspace': {
    task: 'league',
    target: 'league-workspace',
    page: 'league',
    href: '/leagues',
    title: 'Run the event here',
    description:
      'Set the battle format, manage entrants, collect sealed rosters, reveal them together, and keep event battles in one history.',
    placement: 'center',
    final: true,
  },
  'reference-search': {
    task: 'reference',
    target: 'global-search',
    page: 'home',
    href: '/',
    title: 'Find anything',
    description: 'Search pages, factions, datasheets and rules, detachments, missions, and your own rosters and battles from here.',
    placement: 'left',
    next: 'reference-factions',
    nextLabel: 'Browse factions',
  },
  'reference-factions': {
    task: 'reference',
    target: 'faction-reference',
    page: 'factions',
    href: '/factions',
    title: 'Browse armies and units',
    description: 'Choose any faction to see its army rules, detachments, and datasheets.',
    placement: 'center',
  },
  'reference-faction': {
    task: 'reference',
    target: 'faction-datasheets',
    page: 'faction',
    href: '/factions',
    title: 'Learn the army',
    description: 'This page holds the faction abilities and detachments. Open Datasheets to inspect the units the army can field.',
    placement: 'center',
  },
  'reference-datasheets': {
    task: 'reference',
    target: 'datasheet-index',
    page: 'datasheets',
    href: '/factions',
    title: 'Find a unit',
    description: 'Search or browse by battlefield role, then open any datasheet to see the full unit reference.',
    placement: 'center',
  },
  'reference-datasheet': {
    task: 'reference',
    target: 'datasheet-detail',
    page: 'datasheet',
    href: '/factions',
    title: 'Read the full datasheet',
    description: 'Profiles, weapons, abilities, composition, loadout, wargear options, points, and attachments all live here.',
    placement: 'center',
    next: 'reference-missions',
    nextLabel: 'Explore missions',
  },
  'reference-missions': {
    task: 'reference',
    target: 'mission-reference',
    page: 'missions',
    href: '/mission-packs',
    title: 'Choose a matchup',
    description: 'Pick your disposition down the left and your opponent’s across the top, then open the resulting mission.',
    placement: 'center',
  },
  'reference-mission': {
    task: 'reference',
    target: 'mission-detail',
    page: 'mission',
    href: '/mission-packs',
    title: 'Plan the table',
    description: 'The matchup shows both primary missions, their actions, and every available terrain and deployment layout.',
    placement: 'center',
    next: 'reference-rules',
    nextLabel: 'Read the rules',
  },
  'reference-rules': {
    task: 'reference',
    target: 'rules-reference',
    page: 'rules',
    href: '/rules',
    title: 'Find the source rule',
    description: 'Search by printed name or number, or open any document or section to read the source text.',
    placement: 'center',
  },
  'reference-rule-document': {
    task: 'reference',
    target: 'rule-document',
    page: 'rule-document',
    href: '/rules',
    title: 'Use the contents',
    description: 'A document is split into readable sections, with every printed rule listed beneath its section. Open any one.',
    placement: 'center',
  },
  'reference-rule-section': {
    task: 'reference',
    target: 'rule-section',
    page: 'rule-section',
    href: '/rules',
    title: 'Read and follow the rules',
    description: 'Printed rule numbers link directly here. Related rules remain linked, and clarifications open at the addressed passage.',
    placement: 'center',
    final: true,
  },
  'community-home': {
    task: 'community',
    target: 'home-activity',
    page: 'home',
    href: '/',
    title: 'See games in progress',
    description: 'Home keeps your active and recent battles first, followed by watchable games from friends and the wider community.',
    placement: 'center',
    next: 'community-leaderboard',
    nextLabel: 'View standings',
  },
  'community-leaderboard': {
    task: 'community',
    target: 'leaderboard-overview',
    page: 'leaderboard',
    href: '/leaderboard',
    title: 'Follow player standings',
    description:
      'The leaderboard ranks players from finished public battles overall and by faction, with every row linking to a player profile.',
    placement: 'center',
    next: 'community-sharing',
    nextLabel: 'Choose visibility',
  },
  'community-sharing': {
    task: 'community',
    target: 'battle-sharing',
    page: 'profile',
    href: '/profile',
    title: 'Choose who can watch',
    description:
      'Your profile controls whether anyone, friends, or only seated players can watch your battles. Spectators can never change the game.',
    placement: 'top',
    final: true,
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
  if (pathname === '/') return 'home'
  if (pathname === '/friends') return 'friends'
  if (pathname === '/rosters' || pathname === '/rosters/') return 'rosters'
  if (/^\/rosters\/[^/]+\/?$/.test(pathname)) return 'roster'
  if (pathname === '/battles' || pathname === '/battles/') return 'battles'
  if (pathname === '/leagues' || pathname === '/leagues/') return 'leagues'
  if (/^\/leagues\/[^/]+\/?$/.test(pathname)) return 'league'
  if (pathname === '/factions') return 'factions'
  if (/^\/factions\/[^/]+\/datasheets\/[^/]+\/?$/.test(pathname)) return 'datasheet'
  if (/^\/factions\/[^/]+\/datasheets\/?$/.test(pathname)) return 'datasheets'
  if (/^\/factions\/[^/]+\/?$/.test(pathname)) return 'faction'
  if (pathname === '/mission-packs' || /^\/mission-packs\/[^/]+\/?$/.test(pathname)) return 'missions'
  if (/^\/mission-matchups\/[^/]+\/[^/]+\/[^/]+\/?$/.test(pathname)) return 'mission'
  if (pathname === '/leaderboard') return 'leaderboard'
  if (pathname === '/rules') return 'rules'
  if (/^\/rules\/[^/]+\/[^/]+\/?$/.test(pathname)) return 'rule-section'
  if (/^\/rules\/[^/]+\/?$/.test(pathname)) return 'rule-document'
  if (pathname === '/profile') return 'profile'
  return undefined
}

export function canOfferOnboardingWelcome(pathname: string) {
  return !['/sign-in', '/reset-password', '/native-auth'].includes(pathname)
}
