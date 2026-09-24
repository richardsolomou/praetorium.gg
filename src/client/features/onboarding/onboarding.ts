import { onboardingTaskIds, type OnboardingProgressOperation, type OnboardingTaskId } from '../../../core/onboarding'
import type { OnboardingTarget } from '../../onboardingTargets'
export { onboardingTargets, type OnboardingTarget } from '../../onboardingTargets'

export const ONBOARDING_EVENT = 'praetorium:onboarding'
export const ONBOARDING_ADVANCE_EVENT = 'praetorium:onboarding-advance'

/** The tasks the field guide offers, in the order the panel lists them. */
export const onboardingTasks: readonly { id: OnboardingTaskId; title: string; description: string }[] = [
  {
    id: 'roster',
    title: 'Build your first army',
    description: 'Create a roster, choose its faction and detachment, then add the units you want to field.',
  },
  {
    id: 'friend',
    title: 'Add someone you play with',
    description: 'Find another player by account name. Once they accept, you can seat them in a battle.',
  },
  {
    id: 'battle',
    title: 'Start a battle',
    description: 'Choose the players at the table, then work through armies, mission, deployment, and first turn together.',
  },
  {
    id: 'league',
    title: 'Join or run a league',
    description: 'Use registration, sealed rosters, shared reveal, and event battles for organized play.',
  },
  {
    id: 'reference',
    title: 'Explore the game reference',
    description: 'Search Praetorium, browse factions and datasheets, compare missions, and read the source rules.',
  },
  {
    id: 'community',
    title: 'Follow games and players',
    description: 'Watch shared battles, check the standings, read a player, and choose who can see your own games.',
  },
]

export function onboardingFocusStorageKey(userId: string) {
  return `praetorium:focused-onboarding-step:${userId}`
}

export function storedOnboardingFocus(userId: string): OnboardingFocus | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const stored = JSON.parse(sessionStorage.getItem(onboardingFocusStorageKey(userId)) ?? 'null') as Partial<OnboardingFocus> | null
    const task = onboardingTaskIds.find((candidate) => candidate === stored?.task)
    const step = onboardingStepIds.find((candidate) => candidate === stored?.step)
    return task && step && ONBOARDING_UI[step].task === task ? { task, step } : undefined
  } catch {
    return undefined
  }
}

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
  | 'detachment'
  | 'datasheets'
  | 'datasheet'
  | 'missions'
  | 'mission'
  | 'leaderboard'
  | 'rules'
  | 'rule-document'
  | 'rule-section'
  | 'player'
  | 'profile'

export const onboardingStepIds = [
  'roster-start',
  'roster-faction',
  'roster-size',
  'roster-detachment',
  'roster-name',
  'roster-create',
  'roster-picker',
  'roster-search',
  'roster-unit',
  'roster-add',
  'roster-list',
  'roster-points',
  'roster-loadout',
  'roster-models',
  'roster-wargear',
  'roster-weapon',
  'roster-enhancement',
  'roster-unit-points',
  'friend-start',
  'friend-requests',
  'friend-list',
  'friend-invite',
  'battle-start',
  'battle-format',
  'battle-seats',
  'battle-sides',
  'battle-create',
  'league-start',
  'league-name',
  'league-limit',
  'league-visibility',
  'league-joining',
  'league-create',
  'league-entrants',
  'league-format',
  'league-rosters',
  'league-reveal',
  'league-events',
  'reference-search',
  'reference-faction-entry',
  'reference-army-rules',
  'reference-detachments',
  'reference-detachment-rules',
  'reference-enhancements',
  'reference-stratagems',
  'reference-back-to-faction',
  'reference-datasheets',
  'reference-datasheet-search',
  'reference-datasheet-row',
  'reference-datasheet-stats',
  'reference-datasheet-weapons',
  'reference-datasheet-abilities',
  'reference-datasheet-config',
  'reference-datasheet-keywords',
  'reference-secondaries',
  'reference-missions',
  'reference-matchup-primary',
  'reference-matchup-actions',
  'reference-matchup-terrain',
  'reference-rules-search',
  'reference-rules-documents',
  'reference-rule-contents',
  'reference-rule-entry',
  'reference-rule-section',
  'community-home',
  'community-friends',
  'community-public',
  'community-leaderboard',
  'community-standings',
  'community-profile-tabs',
  'community-profile-rankings',
  'community-profile-record',
  'community-sharing',
] as const

export type OnboardingStepId = (typeof onboardingStepIds)[number]
export type OnboardingFocus = { task: OnboardingTaskId; step: OnboardingStepId }
export type OnboardingAdvanceEvent = { task: OnboardingTaskId; from: OnboardingStepId; to: OnboardingStepId }
export type OnboardingPlacement = 'top' | 'bottom' | 'bottom-end' | 'left' | 'right'

type OnboardingStep = {
  task: OnboardingTaskId
  target: OnboardingTarget
  page: OnboardingPage
  href: string
  title: string
  description: string
  placement: OnboardingPlacement
  next?: OnboardingStepId
  /** The copy on a button that takes the player to the next step's page, where `href` reaches it. */
  nextLabel?: string
  /** The server folds this step's task from real rows, so the guide moves on when it says the task is done. */
  awaitsTask?: true
  /** The data need not produce this control, so the guide steps over it rather than stranding on it. */
  optional?: true
  final?: true
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
    title: 'Start an army',
    description: 'Create a list you can edit, price and field. Setup asks for its army and its rules first.',
    placement: 'bottom-end',
    next: 'roster-faction',
  },
  'roster-faction': {
    task: 'roster',
    target: 'setup-faction',
    page: 'rosters',
    href: '/rosters',
    title: 'Choose the army',
    description: 'The faction decides which units, detachments and enhancements the builder will offer you.',
    placement: 'right',
    next: 'roster-size',
  },
  'roster-size': {
    task: 'roster',
    target: 'setup-size',
    page: 'rosters',
    href: '/rosters',
    title: 'Set the battle size',
    description: 'Battle size is the points you have to spend, and it decides how many detachments the list may take.',
    placement: 'right',
    next: 'roster-detachment',
  },
  'roster-detachment': {
    task: 'roster',
    target: 'setup-detachments',
    page: 'rosters',
    href: '/rosters',
    title: 'Pick a detachment',
    description:
      'A detachment brings its own rules, enhancements and stratagems. The icon beside one opens its reference before you commit.',
    placement: 'right',
    next: 'roster-name',
  },
  'roster-name': {
    task: 'roster',
    target: 'setup-name',
    page: 'rosters',
    href: '/rosters',
    title: 'Name it, or leave it',
    description: 'An empty name means the list names itself from its detachment, its size and its best units.',
    placement: 'right',
    next: 'roster-create',
    nextLabel: 'Next',
  },
  'roster-create': {
    task: 'roster',
    target: 'setup-create',
    page: 'rosters',
    href: '/rosters',
    title: 'Create the list',
    description: 'This opens the builder, where units are added and priced against the limit you just set.',
    placement: 'top',
    next: 'roster-picker',
  },
  'roster-picker': {
    task: 'roster',
    target: 'roster-picker',
    page: 'roster',
    href: '/rosters',
    title: 'The unit picker',
    description: 'Every unit this army can field is here. On a phone, Add units opens the picker over your list.',
    placement: 'right',
    next: 'roster-search',
    nextLabel: 'Next',
  },
  'roster-search': {
    task: 'roster',
    target: 'picker-search',
    page: 'roster',
    href: '/rosters',
    title: 'Find a unit fast',
    description:
      'Search by name, keyword or ability. The filters beneath hide anything that will not fit the points left, or that the list already holds its limit of.',
    placement: 'right',
    next: 'roster-unit',
    nextLabel: 'Next',
  },
  'roster-unit': {
    task: 'roster',
    target: 'picker-unit',
    page: 'roster',
    href: '/rosters',
    title: 'Read a row first',
    description:
      'A row carries the unit name and what it costs. Its name opens the full datasheet, and the heart marks the models you own.',
    placement: 'right',
    next: 'roster-add',
    nextLabel: 'Next',
  },
  'roster-add': {
    task: 'roster',
    target: 'picker-add',
    page: 'roster',
    href: '/rosters',
    title: 'Add it to the list',
    description: 'Add puts the unit in your list at its cheapest legal loadout. Add one to carry on.',
    placement: 'right',
    next: 'roster-list',
    awaitsTask: true,
  },
  'roster-list': {
    task: 'roster',
    target: 'roster-list',
    page: 'roster',
    href: '/rosters',
    title: 'Your list',
    description: 'Chosen units sit here by battlefield role. Each card shows its points, its models and any enhancement it carries.',
    placement: 'left',
    next: 'roster-points',
    nextLabel: 'Next',
  },
  'roster-points': {
    task: 'roster',
    target: 'roster-points',
    page: 'roster',
    href: '/rosters',
    title: 'Points and legality',
    description:
      'The running total sits against your battle size, and the tick becomes a warning when the list goes over or breaks a rule. Select a unit to shape it.',
    placement: 'top',
    next: 'roster-loadout',
  },
  'roster-loadout': {
    task: 'roster',
    target: 'roster-loadout',
    page: 'roster',
    href: '/rosters',
    title: 'Shape the unit',
    description: 'The loadout pane holds everything this unit’s datasheet lets you change.',
    placement: 'left',
    next: 'roster-models',
    nextLabel: 'Next',
  },
  'roster-models': {
    task: 'roster',
    target: 'unit-models',
    page: 'roster',
    href: '/rosters',
    title: 'How many models',
    description: 'Squad size is set here. The points and the weapons the unit may carry both follow it.',
    placement: 'bottom',
    next: 'roster-wargear',
    nextLabel: 'Next',
    optional: true,
  },
  'roster-wargear': {
    task: 'roster',
    target: 'loadout-wargear',
    page: 'roster',
    href: '/rosters',
    title: 'Wargear options',
    description: 'Choices that belong to the whole unit rather than one model sit together here, and the list re-prices as you take them.',
    placement: 'left',
    next: 'roster-weapon',
    nextLabel: 'Next',
    optional: true,
  },
  'roster-weapon': {
    task: 'roster',
    target: 'loadout-weapon',
    page: 'roster',
    href: '/rosters',
    title: 'One weapon at a time',
    description: 'Each weapon keeps its own box with its profiles open, and the plus and minus decide how many models carry it.',
    placement: 'left',
    next: 'roster-enhancement',
    nextLabel: 'Next',
    optional: true,
  },
  'roster-enhancement': {
    task: 'roster',
    target: 'loadout-enhancement',
    page: 'roster',
    href: '/rosters',
    title: 'Enhancements',
    description:
      'A character can carry one enhancement from your detachment for the points printed beside it. No enhancement is a choice too.',
    placement: 'left',
    next: 'roster-unit-points',
    nextLabel: 'Next',
    optional: true,
  },
  'roster-unit-points': {
    task: 'roster',
    target: 'unit-points',
    page: 'roster',
    href: '/rosters',
    title: 'What the unit costs',
    description: 'This follows every change you make, and the total at the foot of the list follows it. Your edits save on their own.',
    placement: 'bottom',
    final: true,
  },
  'friend-start': {
    task: 'friend',
    target: 'friend-search',
    page: 'friends',
    href: '/friends',
    title: 'Find a player',
    description: 'Type at least two letters of the name on their account, then send them a request.',
    placement: 'top',
    next: 'friend-requests',
    nextLabel: 'Next',
  },
  'friend-requests': {
    task: 'friend',
    target: 'friend-requests',
    page: 'friends',
    href: '/friends',
    title: 'Requests waiting for you',
    description: 'Anyone who asked to play with you waits here. Accepting one makes the friendship mutual.',
    placement: 'top',
    next: 'friend-list',
    nextLabel: 'Next',
  },
  'friend-list': {
    task: 'friend',
    target: 'friend-list',
    page: 'friends',
    href: '/friends',
    title: 'Who you can play',
    description: 'Confirmed friends are the players you can seat in a battle or bring into a league event.',
    placement: 'top',
    next: 'friend-invite',
    nextLabel: 'Next',
  },
  'friend-invite': {
    task: 'friend',
    target: 'friend-invite',
    page: 'friends',
    href: '/friends',
    title: 'Invite someone without an account',
    description: 'One live link at a time, good for one person. Making a new one retires the old.',
    placement: 'top',
    final: true,
  },
  'battle-start': {
    task: 'battle',
    target: 'create-battle',
    page: 'battles',
    href: '/battles',
    title: 'Open a table',
    description: 'Start a battle once you know who is playing. Everybody is seated as it is created.',
    placement: 'bottom-end',
    next: 'battle-format',
  },
  'battle-format': {
    task: 'battle',
    target: 'battle-format',
    page: 'battles',
    href: '/battles',
    title: 'Table shape',
    description: 'A duel, one player against a pair, or doubles. The shape decides how many seats you fill and how the sides are drawn.',
    placement: 'left',
    next: 'battle-seats',
    nextLabel: 'Next',
  },
  'battle-seats': {
    task: 'battle',
    target: 'battle-seats',
    page: 'battles',
    href: '/battles',
    title: 'Fill every seat',
    description: 'Each seat takes a confirmed friend or a practice opponent, and nobody can sit in two of them.',
    placement: 'left',
    next: 'battle-sides',
    nextLabel: 'Next',
    optional: true,
  },
  'battle-sides': {
    task: 'battle',
    target: 'battle-sides',
    page: 'battles',
    href: '/battles',
    title: 'Check the sides',
    description: 'The matchup shows the two sides as they will be played, before you commit to them.',
    placement: 'left',
    next: 'battle-create',
    nextLabel: 'Next',
    optional: true,
  },
  'battle-create': {
    task: 'battle',
    target: 'battle-create',
    page: 'battles',
    href: '/battles',
    title: 'Start the battle',
    description: 'This opens battle setup, where the armies, the mission, the battlefield and the first turn are settled together.',
    placement: 'top',
    final: true,
  },
  'league-start': {
    task: 'league',
    target: 'create-league',
    page: 'leagues',
    href: '/leagues',
    title: 'Run an event',
    description: 'A league takes entrants, seals their lists and reveals them together. A public league below can be joined instead.',
    placement: 'bottom-end',
    next: 'league-name',
  },
  'league-name': {
    task: 'league',
    target: 'league-name',
    page: 'leagues',
    href: '/leagues',
    title: 'Name the event',
    description: 'Players see this on the leagues page and on the invite you send them.',
    placement: 'right',
    next: 'league-limit',
    nextLabel: 'Next',
  },
  'league-limit': {
    task: 'league',
    target: 'league-limit',
    page: 'leagues',
    href: '/leagues',
    title: 'How many places',
    description: 'Leave it empty for no limit. Set one and every place has to be filled before you can reveal.',
    placement: 'right',
    next: 'league-visibility',
    nextLabel: 'Next',
  },
  'league-visibility': {
    task: 'league',
    target: 'league-visibility',
    page: 'leagues',
    href: '/leagues',
    title: 'Who can find it',
    description: 'A public event is listed for everyone; a private one is reachable only through the link you send.',
    placement: 'right',
    next: 'league-joining',
    nextLabel: 'Next',
  },
  'league-joining': {
    task: 'league',
    target: 'league-joining',
    page: 'leagues',
    href: '/leagues',
    title: 'Who gets in',
    description: 'Approve each entrant yourself, or let anyone with the link take a place.',
    placement: 'right',
    next: 'league-create',
    nextLabel: 'Next',
  },
  'league-create': {
    task: 'league',
    target: 'league-create',
    page: 'leagues',
    href: '/leagues',
    title: 'Create it',
    description: 'Registration opens straight away, and you land on the page you run the event from.',
    placement: 'top',
    next: 'league-entrants',
  },
  'league-entrants': {
    task: 'league',
    target: 'league-entrants',
    page: 'league',
    href: '/leagues',
    title: 'Your entrants',
    description: 'Accept or turn away each player here, and pair them into teams when the event is played as doubles.',
    placement: 'top',
    next: 'league-format',
    nextLabel: 'Next',
  },
  'league-format': {
    task: 'league',
    target: 'league-format',
    page: 'league',
    href: '/leagues',
    title: 'Format and points',
    description: 'Set the table shape and the points every list is built to. It fixes itself once the first list is sealed against it.',
    placement: 'left',
    next: 'league-rosters',
    nextLabel: 'Next',
    optional: true,
  },
  'league-rosters': {
    task: 'league',
    target: 'league-rosters',
    page: 'league',
    href: '/leagues',
    title: 'Sealed lists',
    description: 'Every entrant attaches a list that stays sealed. Until the reveal, only who has submitted is visible — to you as well.',
    placement: 'left',
    next: 'league-reveal',
    nextLabel: 'Next',
  },
  'league-reveal': {
    task: 'league',
    target: 'league-reveal',
    page: 'league',
    href: '/leagues',
    title: 'Reveal together',
    description: 'One press opens every sealed list at once, and entrants can start their event battles from then on.',
    placement: 'left',
    next: 'league-events',
    nextLabel: 'Next',
    optional: true,
  },
  'league-events': {
    task: 'league',
    target: 'league-events',
    page: 'league',
    href: '/leagues',
    title: 'Round after round',
    description: 'The newest event is the one being played. Earlier ones stay here as the league’s archive.',
    placement: 'left',
    final: true,
  },
  'reference-search': {
    task: 'reference',
    target: 'global-search',
    page: 'home',
    href: '/',
    title: 'Search everything',
    description: 'Pages, factions, datasheets, detachments, missions, rules, and your own lists and battles, all from one box.',
    placement: 'left',
    next: 'reference-faction-entry',
    nextLabel: 'Browse factions',
  },
  'reference-faction-entry': {
    task: 'reference',
    target: 'faction-entry',
    page: 'factions',
    href: '/factions',
    title: 'Every army',
    description: 'Each row names an army and how many detachments it brings. Open one to read it.',
    placement: 'bottom',
    next: 'reference-army-rules',
  },
  'reference-army-rules': {
    task: 'reference',
    target: 'faction-army-rules',
    page: 'faction',
    href: '/factions',
    title: 'Army rules',
    description: 'The abilities every unit in this army carries, in the words the source uses for them.',
    placement: 'bottom',
    next: 'reference-detachments',
    nextLabel: 'Next',
    optional: true,
  },
  'reference-detachments': {
    task: 'reference',
    target: 'faction-detachments',
    page: 'faction',
    href: '/factions',
    title: 'Detachments',
    description: 'A list may only take what its detachment offers, so this is where an army is really chosen. Open one.',
    placement: 'bottom',
    next: 'reference-detachment-rules',
  },
  'reference-detachment-rules': {
    task: 'reference',
    target: 'detachment-rules',
    page: 'detachment',
    href: '/factions',
    title: 'Detachment rules',
    description: 'What this detachment gives every army built on it.',
    placement: 'bottom',
    next: 'reference-enhancements',
    nextLabel: 'Next',
    optional: true,
  },
  'reference-enhancements': {
    task: 'reference',
    target: 'detachment-enhancements',
    page: 'detachment',
    href: '/factions',
    title: 'Enhancements',
    description: 'Upgrades for a single character, at the points printed on each one. A list takes them from its own detachment.',
    placement: 'bottom',
    next: 'reference-stratagems',
    nextLabel: 'Next',
  },
  'reference-stratagems': {
    task: 'reference',
    target: 'detachment-stratagems',
    page: 'detachment',
    href: '/factions',
    title: 'Stratagems',
    description:
      'Each one names its cost, its phase and whose turn it belongs to. In a battle you are only offered the ones the moment allows.',
    placement: 'bottom',
    next: 'reference-back-to-faction',
    nextLabel: 'Next',
  },
  'reference-back-to-faction': {
    task: 'reference',
    target: 'detachment-breadcrumb',
    page: 'detachment',
    href: '/factions',
    title: 'Back to the army',
    description: 'This returns to the army the detachment belongs to, where its units are listed.',
    placement: 'bottom',
    next: 'reference-datasheets',
  },
  'reference-datasheets': {
    task: 'reference',
    target: 'faction-datasheets',
    page: 'faction',
    href: '/factions',
    title: 'The units',
    description: 'Datasheets holds every unit this army can field, with what each of them costs.',
    placement: 'bottom',
    next: 'reference-datasheet-search',
  },
  'reference-datasheet-search': {
    task: 'reference',
    target: 'datasheet-search',
    page: 'datasheets',
    href: '/factions',
    title: 'Find a unit',
    description: 'Search by unit name, or open a battlefield-role shelf below and browse.',
    placement: 'bottom',
    next: 'reference-datasheet-row',
    nextLabel: 'Next',
  },
  'reference-datasheet-row': {
    task: 'reference',
    target: 'datasheet-row',
    page: 'datasheets',
    href: '/factions',
    title: 'Open a datasheet',
    description: 'A row carries the unit name and its points. Open one to read the whole unit.',
    placement: 'bottom',
    next: 'reference-datasheet-stats',
  },
  'reference-datasheet-stats': {
    task: 'reference',
    target: 'datasheet-stats',
    page: 'datasheet',
    href: '/factions',
    title: 'The unit profile',
    description:
      'Movement, toughness, save, wounds, leadership and objective control — one line per model kind where a unit has more than one.',
    placement: 'bottom',
    next: 'reference-datasheet-weapons',
    nextLabel: 'Next',
  },
  'reference-datasheet-weapons': {
    task: 'reference',
    target: 'datasheet-weapons',
    page: 'datasheet',
    href: '/factions',
    title: 'Weapons',
    description: 'Range, attacks, skill, strength, armour penetration and damage, with every profile a weapon can be fired at.',
    placement: 'bottom',
    next: 'reference-datasheet-abilities',
    nextLabel: 'Next',
    optional: true,
  },
  'reference-datasheet-abilities': {
    task: 'reference',
    target: 'datasheet-abilities',
    page: 'datasheet',
    href: '/factions',
    title: 'Abilities',
    description: 'The core, army and unit abilities this unit brings to the table.',
    placement: 'bottom',
    next: 'reference-datasheet-config',
    nextLabel: 'Next',
    optional: true,
  },
  'reference-datasheet-config': {
    task: 'reference',
    target: 'datasheet-config',
    page: 'datasheet',
    href: '/factions',
    title: 'Sizes, points and wargear',
    description: 'The sizes this unit can be taken at, what each size costs, and the wargear swaps the builder will offer you.',
    placement: 'bottom',
    next: 'reference-datasheet-keywords',
    nextLabel: 'Next',
    optional: true,
  },
  'reference-datasheet-keywords': {
    task: 'reference',
    target: 'datasheet-keywords',
    page: 'datasheet',
    href: '/factions',
    title: 'Keywords',
    description: 'Keywords decide which rules reach a unit. Hover one and the source’s own definition of it appears.',
    placement: 'bottom',
    next: 'reference-secondaries',
    nextLabel: 'Explore missions',
  },
  'reference-secondaries': {
    task: 'reference',
    target: 'mission-secondaries',
    page: 'missions',
    href: '/mission-packs',
    title: 'Secondary missions',
    description: 'The deck both players draw from during a game. Open a card to read what it scores and what it asks of you.',
    placement: 'top',
    next: 'reference-missions',
    nextLabel: 'Next',
  },
  'reference-missions': {
    task: 'reference',
    target: 'mission-dispositions',
    page: 'missions',
    href: '/mission-packs',
    title: 'Pick the matchup',
    description:
      'Your disposition runs down the left and your opponent’s across the top. The cell between them is the mission you would play.',
    placement: 'top',
    next: 'reference-matchup-primary',
  },
  'reference-matchup-primary': {
    task: 'reference',
    target: 'matchup-primary',
    page: 'mission',
    href: '/mission-packs',
    title: 'The primary missions',
    description: 'Both sides’ primary missions, with when each one scores and what it pays.',
    placement: 'bottom',
    next: 'reference-matchup-actions',
    nextLabel: 'Next',
  },
  'reference-matchup-actions': {
    task: 'reference',
    target: 'matchup-actions',
    page: 'mission',
    href: '/mission-packs',
    title: 'Actions',
    description: 'What each side’s mission asks a unit to do, so it is known before the first turn.',
    placement: 'bottom',
    next: 'reference-matchup-terrain',
    nextLabel: 'Next',
    optional: true,
  },
  'reference-matchup-terrain': {
    task: 'reference',
    target: 'matchup-terrain',
    page: 'mission',
    href: '/mission-packs',
    title: 'Battlefields',
    description: 'Every terrain and deployment layout this pairing can be played on, with the distances the source prints.',
    placement: 'bottom',
    next: 'reference-rules-search',
    nextLabel: 'Read the rules',
  },
  'reference-rules-search': {
    task: 'reference',
    target: 'rules-search',
    page: 'rules',
    href: '/rules',
    title: 'Find a rule',
    description: 'Search by the name the rulebook prints, or by the number beside it, such as 09.04.',
    placement: 'bottom',
    next: 'reference-rules-documents',
    nextLabel: 'Next',
  },
  'reference-rules-documents': {
    task: 'reference',
    target: 'rules-documents',
    page: 'rules',
    href: '/rules',
    title: 'The documents',
    description: 'Each document lists its sections and how many rules they hold. Open one.',
    placement: 'bottom',
    next: 'reference-rule-contents',
  },
  'reference-rule-contents': {
    task: 'reference',
    target: 'rule-contents',
    page: 'rule-document',
    href: '/rules',
    title: 'What is in it',
    description: 'Every rule is listed under its section by the number the source prints against it.',
    placement: 'bottom',
    next: 'reference-rule-entry',
    nextLabel: 'Next',
  },
  'reference-rule-entry': {
    task: 'reference',
    target: 'rule-entry',
    page: 'rule-document',
    href: '/rules',
    title: 'Open a rule',
    description: 'A rule number is a link, so anything that quotes one takes you straight to it.',
    placement: 'bottom',
    next: 'reference-rule-section',
  },
  'reference-rule-section': {
    task: 'reference',
    target: 'rule-article',
    page: 'rule-section',
    href: '/rules',
    title: 'Read it',
    description: 'The rule in the source’s own words, with its clarifications beneath it.',
    placement: 'bottom',
    final: true,
  },
  'community-home': {
    task: 'community',
    target: 'home-activity',
    page: 'home',
    href: '/',
    title: 'Home',
    description: 'Your own games come first, with a way straight into another battle or another army.',
    placement: 'bottom',
    next: 'community-friends',
    nextLabel: 'Next',
  },
  'community-friends': {
    task: 'community',
    target: 'home-friends',
    page: 'home',
    href: '/',
    title: 'What your friends are playing',
    description: 'Games your friends have shared, apart from the ones you are already sitting in.',
    placement: 'top',
    next: 'community-public',
    nextLabel: 'Next',
    optional: true,
  },
  'community-public': {
    task: 'community',
    target: 'home-public',
    page: 'home',
    href: '/',
    title: 'Anybody’s games',
    description: 'Battles shared with everyone. Watching one takes no seat and changes nothing in it.',
    placement: 'top',
    next: 'community-leaderboard',
    nextLabel: 'View standings',
    optional: true,
  },
  'community-leaderboard': {
    task: 'community',
    target: 'leaderboard-faction',
    page: 'leaderboard',
    href: '/leaderboard',
    title: 'Rank one army',
    description: 'Narrow the table to a faction and it ranks the players who fielded it, rather than giving the army a record of its own.',
    placement: 'bottom',
    next: 'community-standings',
    nextLabel: 'Next',
    optional: true,
  },
  'community-standings': {
    task: 'community',
    target: 'standings-table',
    page: 'leaderboard',
    href: '/leaderboard',
    title: 'Wins, then win rate',
    description:
      'Finished public battles from the last 90 days, ranked by wins and then by the rate beside them. Open a row to read that player.',
    placement: 'top',
    next: 'community-profile-tabs',
  },
  'community-profile-tabs': {
    task: 'community',
    target: 'profile-tabs',
    page: 'player',
    href: '/leaderboard',
    title: 'A player',
    description: 'Their record, the battles you are allowed to watch, and any lists they have published.',
    placement: 'bottom',
    next: 'community-profile-rankings',
    nextLabel: 'Next',
  },
  'community-profile-rankings': {
    task: 'community',
    target: 'profile-rankings',
    page: 'player',
    href: '/leaderboard',
    title: 'Where they place',
    description: 'Every leaderboard this player appears on, overall and for each army they have fielded.',
    placement: 'top',
    next: 'community-profile-record',
    nextLabel: 'Next',
    optional: true,
  },
  'community-profile-record': {
    task: 'community',
    target: 'profile-record',
    page: 'player',
    href: '/leaderboard',
    title: 'Their record',
    description: 'Wins, win rate by who took the first turn, victory points and streaks, narrowed to the battles you may watch.',
    placement: 'top',
    next: 'community-sharing',
    nextLabel: 'Choose who can watch',
  },
  'community-sharing': {
    task: 'community',
    target: 'battle-sharing',
    page: 'profile',
    href: '/profile',
    title: 'Who can watch yours',
    description: 'Anyone, your friends, or only the players at the table. The strictest answer at a table applies to everybody in it.',
    placement: 'top',
    final: true,
  },
}

export function openOnboarding() {
  window.dispatchEvent(new Event(ONBOARDING_EVENT))
}

/** Moves the guide on within one page, where a dialog or a selection is the whole transition. */
export function advanceOnboarding(task: OnboardingTaskId, from: OnboardingStepId, to: OnboardingStepId) {
  window.dispatchEvent(new CustomEvent<OnboardingAdvanceEvent>(ONBOARDING_ADVANCE_EVENT, { detail: { task, from, to } }))
}

export function nextOnboardingFocus(focus: OnboardingFocus | undefined, advance: OnboardingAdvanceEvent) {
  if (!focus || focus.task !== advance.task || focus.step !== advance.from) return focus
  return { task: advance.task, step: advance.to } satisfies OnboardingFocus
}

/** The step a player reaches by arriving on the next step's own page, rather than by pressing anything. */
export function focusAfterOnboardingNavigation(focus: OnboardingFocus | undefined, page: OnboardingPage | undefined) {
  if (!focus || !page) return focus
  const step = ONBOARDING_UI[focus.step]
  const next = step.next ? ONBOARDING_UI[step.next] : undefined
  if (!step.next || !next || next.page === step.page || next.page !== page) return focus
  return { task: focus.task, step: step.next } satisfies OnboardingFocus
}

/**
 * The step to move to when a control the data need not produce never appears.
 *
 * A faction with no enhancements and a unit with no ranged weapons are ordinary
 * data, not a lost guide, so the step hands on to its successor instead of
 * offering to take the player somewhere they already are.
 */
export function onboardingStepPastAbsentTarget(step: OnboardingStepId): OnboardingStepId | undefined {
  const current = ONBOARDING_UI[step]
  return current.optional ? current.next : undefined
}

/**
 * Whether the compact prompt belongs at the top of the screen.
 *
 * A phone puts the card at the foot of the window, which is exactly where the roster
 * keeps its points and its Add units button — so a card describing one of those would
 * cover it. It moves out of the way rather than the control moving.
 */
export function onboardingPromptAtTop(targetBottom: number | undefined, viewportHeight: number) {
  return targetBottom !== undefined && targetBottom > viewportHeight * 0.6
}

/** The address a step needs, which is nothing at all when the player is already reading its page. */
export function onboardingHrefFor(step: OnboardingStepId, page: OnboardingPage | undefined): string | undefined {
  return ONBOARDING_UI[step].page === page ? undefined : ONBOARDING_UI[step].href
}

/** Where a step whose control is nowhere sends the player: the last step of its task an address reaches. */
export function onboardingStepEntry(step: OnboardingStepId): OnboardingStepId {
  const first = FIRST_ONBOARDING_STEP[ONBOARDING_UI[step].task]
  let entry = first
  for (let current: OnboardingStepId | undefined = first; current; current = ONBOARDING_UI[current].next) {
    if (onboardingPage(ONBOARDING_UI[current].href) === ONBOARDING_UI[current].page) entry = current
    if (current === step) break
  }
  return entry
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
  if (/^\/factions\/[^/]+\/detachments\/[^/]+\/?$/.test(pathname)) return 'detachment'
  if (/^\/factions\/[^/]+\/datasheets\/[^/]+\/?$/.test(pathname)) return 'datasheet'
  if (/^\/factions\/[^/]+\/datasheets\/?$/.test(pathname)) return 'datasheets'
  if (/^\/factions\/[^/]+\/?$/.test(pathname)) return 'faction'
  if (pathname === '/mission-packs' || /^\/mission-packs\/[^/]+\/?$/.test(pathname)) return 'missions'
  if (/^\/mission-matchups\/[^/]+\/[^/]+\/[^/]+\/?$/.test(pathname)) return 'mission'
  if (pathname === '/leaderboard') return 'leaderboard'
  if (pathname === '/rules') return 'rules'
  if (/^\/rules\/[^/]+\/[^/]+\/?$/.test(pathname)) return 'rule-section'
  if (/^\/rules\/[^/]+\/?$/.test(pathname)) return 'rule-document'
  if (/^\/users\/[^/]+\/?$/.test(pathname)) return 'player'
  if (pathname === '/profile') return 'profile'
  return undefined
}
