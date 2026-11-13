import { z } from 'zod'
import { parseStored, readSessionValue } from '../../storedValue'
import { onboardingTaskIds, type OnboardingTaskId } from '../../../core/onboarding'
import type { OnboardingTarget } from '../../onboardingTargets'

export const ONBOARDING_FOCUS_EVENT = 'praetorium:onboarding-focus'
export const ONBOARDING_EVENT = 'praetorium:onboarding'
export const ONBOARDING_ADVANCE_EVENT = 'praetorium:onboarding-advance'

export function onboardingFocusStorageKey(userId: string) {
  return `praetorium:focused-onboarding-step:${userId}`
}

export const storedOnboardingFocus = (userId: string): OnboardingFocus | undefined =>
  parseStored(onboardingFocusSchema, readSessionValue(onboardingFocusStorageKey(userId))) ?? undefined

type OnboardingPage =
  | 'home'
  | 'rosters'
  | 'roster'
  | 'friends'
  | 'battles'
  | 'battle'
  | 'simulator'
  | 'tournaments'
  | 'tournament'
  | 'groups'
  | 'group'
  | 'collection'

export const onboardingStepIds = [
  'simulator-attacker',
  'simulator-defender',
  'simulator-results',
  'tools-input',
  'tools-review',
  'tools-finished',
  'tools-import',
  'battle-setup-size',
  'battle-setup-mission',
  'battle-setup-battlefield',
  'battle-setup-defender',
  'battle-setup-secondaries',
  'battle-setup-reserves',
  'battle-setup-deploy',
  'battle-setup-first',
  'battle-setup-begin',
  'battle-live-score',
  'battle-live-turn',
  'battle-live-side',
  'battle-live-report',
  'roster-start',
  'roster-faction',
  'roster-size',
  'roster-detachment',
  'roster-name',
  'roster-create',
  'roster-picker',
  'roster-search',
  'roster-add',
  'roster-list',
  'friend-start',
  'friend-requests',
  'friend-list',
  'friend-invite',
  'battle-start',
  'sealed-event-start',
  'sealed-event-format',
  'sealed-event-options',
  'sealed-event-create',
  'sealed-event-entrants',
  'sealed-event-rosters',
  'sealed-event-reveal',
  'sealed-event-status',
  'reference-search',
  'community-public',
  'group-start',
  'group-access',
  'group-create',
  'group-invite',
  'group-new-game',
  'group-tabs',
  'collection-add',
  'collection-counts',
  'collection-menu',
  'collection-wishlist',
  'collection-exchange',
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
  entry?: OnboardingStepId
  /** The data need not produce this control, so the guide steps over it rather than stranding on it. */
  optional?: true
  final?: true
}

export const FIRST_ONBOARDING_STEP: Record<OnboardingTaskId, OnboardingStepId> = {
  roster: 'roster-start',
  friend: 'friend-start',
  battle: 'battle-start',
  tournament: 'sealed-event-start',
  reference: 'reference-search',
  community: 'community-public',
  simulator: 'simulator-attacker',
  'roster-tools': 'tools-import',
  group: 'group-start',
  collection: 'collection-add',
}

export const ONBOARDING_UI: Record<OnboardingStepId, OnboardingStep> = {
  'simulator-attacker': {
    task: 'simulator',
    target: 'simulator-attacker',
    page: 'simulator',
    href: '/simulator',
    title: 'Choose an attacker',
    description: 'Choose a unit from any faction. Its models and weapons decide the attacks to calculate. Select one to continue.',
    placement: 'bottom',
    next: 'simulator-defender',
  },
  'simulator-defender': {
    task: 'simulator',
    target: 'simulator-defender',
    page: 'simulator',
    href: '/simulator',
    title: 'Choose a defender',
    description: 'Select the target. Shooting and melee calculate automatically against its toughness, saves, and wounds.',
    placement: 'bottom',
    next: 'simulator-results',
  },
  'simulator-results': {
    task: 'simulator',
    target: 'simulator-results',
    page: 'simulator',
    href: '/simulator',
    title: 'Read the odds',
    description:
      'Chance to destroy means removing the whole target unit. Average wounds and models lost describe expected damage. Breakdown separates shooting, melee, and shooting followed by melee.',
    placement: 'top',
    final: true,
  },
  'tools-import': {
    task: 'roster-tools',
    target: 'roster-import',
    page: 'rosters',
    href: '/rosters',
    title: 'Bring an existing army',
    description:
      'Open Import roster to bring an existing army. Export your list as Games Workshop text from your army builder, or use a Praetorium exchange code.',
    placement: 'bottom',
    next: 'tools-input',
  },
  'battle-setup-size': {
    task: 'battle',
    target: 'battle-setup-size',
    page: 'battle',
    href: '/battles',
    title: 'Tracking and armies',
    description:
      'Choose how you track the battle, then your army on your card at the top. The first list sets the battle size. Share a link, invite a friend or play both sides to fill the other side.',
    placement: 'bottom',
    next: 'battle-setup-mission',
    nextLabel: 'Next',
  },
  'battle-setup-mission': {
    task: 'battle',
    target: 'battle-setup-mission',
    page: 'battle',
    href: '/battles',
    title: 'Read your primary mission',
    description:
      'Your army’s Force Disposition and its opponent determine the primary mission. Read each side’s card, settle any allied disposition choice, and change the twist if you play one.',
    placement: 'bottom',
    next: 'battle-setup-battlefield',
    nextLabel: 'Next',
  },
  'battle-setup-battlefield': {
    task: 'battle',
    target: 'battle-setup-battlefield',
    page: 'battle',
    href: '/battles',
    title: 'Set the battlefield',
    description: 'Choose the deployment and terrain layout for this matchup, then arrange the table.',
    placement: 'bottom',
    next: 'battle-setup-defender',
    nextLabel: 'Next',
  },
  'battle-setup-defender': {
    task: 'battle',
    target: 'battle-setup-defender',
    page: 'battle',
    href: '/battles',
    title: 'Record the defender',
    description: 'Resolve the roll-off at the table and record who defends. The defender deploys first.',
    placement: 'bottom',
    next: 'battle-setup-secondaries',
    nextLabel: 'Next',
  },
  'battle-setup-secondaries': {
    task: 'battle',
    target: 'battle-setup-secondaries',
    page: 'battle',
    href: '/battles',
    title: 'Choose secondary missions',
    description: 'Tactical cards drawn during play are the default. Change your side to fixed cards to choose two for the whole game.',
    placement: 'bottom',
    next: 'battle-setup-reserves',
    nextLabel: 'Next',
  },
  'battle-setup-reserves': {
    task: 'battle',
    target: 'battle-setup-reserves',
    page: 'battle',
    href: '/battles',
    title: 'Set reserves and transports',
    description:
      'Every unit starts on the battlefield unless your side changes it. Record units held in reserves or embarked in a transport; each transport takes only the passengers its rule allows.',
    placement: 'bottom',
    next: 'battle-setup-deploy',
    nextLabel: 'Next',
  },
  'battle-setup-deploy': {
    task: 'battle',
    target: 'battle-setup-deploy',
    page: 'battle',
    href: '/battles',
    title: 'Deploy the armies',
    description: 'Alternate deploying units from the defender. Move the models on the table; Praetorium does not record their positions.',
    placement: 'bottom',
    next: 'battle-setup-first',
    nextLabel: 'Next',
  },
  'battle-setup-first': {
    task: 'battle',
    target: 'battle-setup-first',
    page: 'battle',
    href: '/battles',
    title: 'Record the first turn',
    description: 'After deployment, resolve the roll-off and record which side takes the first turn.',
    placement: 'bottom',
    next: 'battle-setup-begin',
    nextLabel: 'Next',
  },
  'battle-setup-begin': {
    task: 'battle',
    target: 'battle-setup-begin',
    page: 'battle',
    href: '/battles',
    title: 'Resolve pre-battle rules',
    description:
      'Resolve Scouts and other pre-battle abilities at the table. Start battle is enabled once nothing is left, and opens the first Command phase.',
    placement: 'bottom',
    next: 'battle-live-score',
  },
  'battle-live-score': {
    task: 'battle',
    target: 'battle-live-score',
    page: 'battle',
    href: '/battles',
    title: 'Follow the score',
    description: 'The scoreboard shows both sides’ points and whose turn it is. Allies share their score, command points, and turn.',
    placement: 'bottom',
    next: 'battle-live-turn',
    nextLabel: 'Next',
  },
  'battle-live-turn': {
    task: 'battle',
    target: 'battle-live-turn',
    page: 'battle',
    href: '/battles',
    title: 'Advance phases and undo',
    description:
      'End each phase here. Required draws and scoring prompts appear as the game advances. Undo rewinds the latest action, including scoring and casualties; turn times are recorded as you play.',
    placement: 'top',
    next: 'battle-live-side',
    nextLabel: 'Next',
  },
  'battle-live-side': {
    task: 'battle',
    target: 'battle-live-side',
    page: 'battle',
    href: '/battles',
    title: 'Use your army and mission controls',
    description:
      'Your side holds mission scoring, CP, and stratagems. Open a unit to record wounds or lost models, or simulate an attack without changing the battle. On a phone, Your side and Opponent switch armies.',
    placement: 'bottom',
    next: 'battle-live-report',
    nextLabel: 'Next',
  },
  'battle-live-report': {
    task: 'battle',
    target: 'battle-live-report',
    page: 'battle',
    href: '/battles',
    title: 'Read the battle back',
    description:
      'Battle events records what happened. Battle options includes the timer and concession controls. A finished battle opens as a replay; use its timeline to revisit earlier rounds and actions.',
    placement: 'bottom',
    final: true,
  },
  'roster-start': {
    task: 'roster',
    target: 'create-roster',
    page: 'rosters',
    href: '/rosters',
    title: 'Start an army',
    description: 'Create a roster you can edit, price and field. Setup asks for its army and its rules first.',
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
    description: 'Battle size sets the army’s points limit and detachment-point budget. The setup shows how many DP your choices use.',
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
      'Each detachment costs DP and brings rules, enhancements, and stratagems. Keep DP used within your budget. Its icon opens the reference before you commit.',
    placement: 'right',
    next: 'roster-name',
  },
  'roster-name': {
    task: 'roster',
    target: 'setup-name',
    page: 'rosters',
    href: '/rosters',
    title: 'Name it, or leave it',
    description:
      'An empty name means the roster names itself from its army. If setup offers more than one Force disposition, choose one above before creating the roster; it helps decide your primary mission in battle.',
    placement: 'right',
    next: 'roster-create',
    nextLabel: 'Next',
  },
  'roster-create': {
    task: 'roster',
    target: 'setup-create',
    page: 'rosters',
    href: '/rosters',
    title: 'Create the roster',
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
    description: 'Every unit this army can field is here. On a phone, Add units opens the picker over your roster.',
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
      'Search by name, keyword or ability. The filters beneath hide anything that will not fit the points left, or that the roster already holds its limit of.',
    placement: 'right',
    next: 'roster-add',
    nextLabel: 'Next',
  },
  'roster-add': {
    task: 'roster',
    target: 'picker-add',
    page: 'roster',
    href: '/rosters',
    title: 'Add it to the roster',
    description: 'Add puts the unit in your roster at its cheapest legal loadout. Add one to carry on.',
    placement: 'right',
    next: 'roster-list',
  },
  'roster-list': {
    task: 'roster',
    target: 'roster-list',
    page: 'roster',
    href: '/rosters',
    title: 'Your roster',
    description:
      'Your first unit is in the army. Keep adding units here; select one to change its equipment. Your edits are kept as you build.',
    placement: 'right',
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
    optional: true,
    next: 'friend-list',
    nextLabel: 'Next',
  },
  'friend-list': {
    task: 'friend',
    target: 'friend-list',
    page: 'friends',
    href: '/friends',
    title: 'Who you can play',
    description: 'Confirmed friends are the players you can seat in a battle or bring into a tournament.',
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
    description: 'New battle opens setup straight away. Set up what you can, then bring your opponent in.',
    placement: 'bottom-end',
    next: 'battle-setup-size',
  },
  'battle-seats': {
    task: 'battle',
    target: 'battle-seats',
    page: 'battles',
    href: '/battles',
    title: 'Fill every seat',
    description: 'Each seat takes a confirmed friend or a practice opponent, and nobody can sit in two of them.',
    placement: 'left',
    next: 'battle-create',
    nextLabel: 'Next',
    optional: true,
  },
  'battle-create': {,
  },
  'sealed-event-start': {
    task: 'tournament',
    target: 'create-sealed-event',
    page: 'tournaments',
    href: '/tournaments',
    title: 'Run a tournament',
    description:
      'Everyone seals a roster in secret, the rosters open together, then you play each other and the results build up. A public tournament below can be joined instead.',
    placement: 'bottom-end',
    next: 'sealed-event-format',
  },
  'sealed-event-format': {
    task: 'tournament',
    target: 'sealed-event-format',
    page: 'tournaments',
    href: '/tournaments',
    title: 'Format and points',
    description: 'The tournament sets its table shape and the points every roster is built to. They lock once the first roster is sealed.',
    placement: 'right',
    next: 'sealed-event-options',
    nextLabel: 'Next',
  },
  'sealed-event-options': {
    task: 'tournament',
    target: 'sealed-event-options',
    page: 'tournaments',
    href: '/tournaments',
    title: 'Everything else can wait',
    description:
      'A private link anyone can join is the usual start. Open More options for details, a player limit, a public listing, or approving each player.',
    placement: 'right',
    next: 'sealed-event-create',
    nextLabel: 'Next',
  },
  'sealed-event-create': {
    task: 'tournament',
    target: 'sealed-event-create',
    page: 'tournaments',
    href: '/tournaments',
    title: 'Create it',
    description: 'It opens straight away, and you land on its page, where you run the tournament and play in it.',
    placement: 'top',
    next: 'sealed-event-entrants',
  },
  'sealed-event-entrants': {
    task: 'tournament',
    target: 'sealed-event-entrants',
    page: 'tournament',
    href: '/tournaments',
    title: 'Your entrants',
    description: 'Requests to join wait above this list. Accepted players appear here, grouped by side or team when the format has them.',
    placement: 'top',
    next: 'sealed-event-rosters',
    nextLabel: 'Next',
  },
  'sealed-event-rosters': {
    task: 'tournament',
    target: 'sealed-event-rosters',
    page: 'tournament',
    href: '/tournaments',
    title: 'Before the reveal',
    description:
      'Everyone sees whose roster is sealed, and rosters stay hidden, from you as well. Once every roster is in, you or anyone playing can reveal them.',
    placement: 'bottom',
    next: 'sealed-event-reveal',
    nextLabel: 'Next',
  },
  'sealed-event-reveal': {
    task: 'tournament',
    target: 'sealed-event-reveal',
    page: 'tournament',
    href: '/tournaments',
    title: 'Reveal together',
    description: 'One press opens every sealed roster at once, and entrants can start their battles from then on.',
    placement: 'bottom-end',
    next: 'sealed-event-status',
    nextLabel: 'Next',
    optional: true,
  },
  'sealed-event-status': {
    task: 'tournament',
    target: 'sealed-event-status',
    page: 'tournament',
    href: '/tournaments',
    title: 'Your own place',
    description: 'Players see this same page. This card is where you join, seal your roster, and start battles once the rosters are out.',
    placement: 'bottom',
    final: true,
  },
  'reference-search': {
    task: 'reference',
    target: 'global-search',
    page: 'home',
    href: '/',
    title: 'Search everything',
    description:
      'Search for a unit, rule, faction, mission, or one of your armies. Open a result to read it; use its source link when you need the full rules text.',
    placement: 'left',
    final: true,
  },
  'community-public': {
    task: 'community',
    target: 'home-public',
    page: 'home',
    href: '/',
    title: 'Anybody’s games',
    description: 'Battles shared with everyone. Watching one takes no seat and changes nothing in it.',
    placement: 'top',
    final: true,
  },
  'tools-input': {
    task: 'roster-tools',
    target: 'import-input',
    entry: 'tools-import',
    page: 'rosters',
    href: '/rosters',
    title: 'Paste your army',
    description:
      'Paste the exported text or exchange code, then choose Import pasted roster. A link to another army builder is not an army-text export.',
    placement: 'top',
    next: 'tools-review',
  },
  'tools-review': {
    task: 'roster-tools',
    target: 'import-review',
    entry: 'tools-import',
    page: 'rosters',
    href: '/rosters',
    title: 'Check what matched',
    description:
      'Review matched entries, points, and any warnings. Missing units are left out; unmatched equipment uses the defaults. Edit your text to try again, or accept the reviewed list to open it.',
    placement: 'top',
    next: 'tools-finished',
  },
  'tools-finished': {
    task: 'roster-tools',
    target: 'roster-points',
    page: 'roster',
    href: '/rosters',
    title: 'Your imported army',
    description:
      'Check the points and equipment before playing. Without an account, this device keeps the draft; Save roster takes you through signing in and returns you to your army.',
    placement: 'top',
    final: true,
  },
  'group-start': {
    task: 'group',
    target: 'create-group',
    page: 'groups',
    href: '/groups',
    title: 'Start a group',
    description: 'A group keeps one leaderboard for the people you play with, from a few friends to a shop’s open night.',
    placement: 'bottom-end',
    next: 'group-access',
  },
  'group-access': {
    task: 'group',
    target: 'group-access',
    page: 'groups',
    href: '/groups',
    title: 'Who finds it, who gets in',
    description:
      'A public group is listed on the Groups page; a private one is found only through its link. Choose You approve to check each request first. Both can change later.',
    placement: 'right',
    next: 'group-create',
    nextLabel: 'Next',
  },
  'group-create': {
    task: 'group',
    target: 'group-create',
    page: 'groups',
    href: '/groups',
    title: 'Create it',
    description: 'You land on the group’s own page, where you invite players and start games.',
    placement: 'top',
    next: 'group-invite',
  },
  'group-invite': {
    task: 'group',
    target: 'group-invite',
    page: 'group',
    href: '/groups',
    title: 'Invite your players',
    description:
      'The group’s link is its invite. Send it to the people you play with; requests to join wait on this page when you approve each player.',
    placement: 'bottom-end',
    next: 'group-new-game',
    nextLabel: 'Next',
  },
  'group-new-game': {
    task: 'group',
    target: 'group-new-game',
    page: 'group',
    href: '/groups',
    title: 'Play for the group',
    description:
      'New game seats other members, and the battle counts for the group. A battle started from Battles counts too when its players choose the group at setup.',
    placement: 'bottom-end',
    next: 'group-tabs',
    nextLabel: 'Next',
  },
  'group-tabs': {
    task: 'group',
    target: 'group-tabs',
    page: 'group',
    href: '/groups',
    title: 'Follow the standings',
    description:
      'The leaderboard ranks members by their finished group games. An organizer can also run a league, a round robin with its own fixtures, from the League tab.',
    placement: 'bottom',
    final: true,
  },
  'collection-add': {
    task: 'collection',
    target: 'collection-add',
    page: 'collection',
    href: '/collection',
    title: 'Add what you own',
    description: 'Search for a datasheet you have models for. A datasheet’s own page can add it too, from its Add menu.',
    placement: 'bottom',
    next: 'collection-counts',
    nextLabel: 'Next',
  },
  'collection-counts': {
    task: 'collection',
    target: 'collection-counts',
    page: 'collection',
    href: '/collection',
    title: 'Owned, built, painted',
    description:
      'Set how many models you own, then how many of those are built and painted. Each army, and the shelf at the top, totals them.',
    placement: 'bottom',
    optional: true,
    next: 'collection-menu',
    nextLabel: 'Next',
  },
  'collection-menu': {
    task: 'collection',
    target: 'collection-menu',
    page: 'collection',
    href: '/collection',
    title: 'One kit, several datasheets',
    description:
      'Can also be… in this menu lets the same models stand in for another datasheet, such as a magnetised kit’s other builds. Your rosters still count each model once.',
    placement: 'bottom-end',
    optional: true,
    next: 'collection-wishlist',
    nextLabel: 'Next',
  },
  'collection-wishlist': {
    task: 'collection',
    target: 'collection-wishlist',
    page: 'collection',
    href: '/collection',
    title: 'Plan what to buy',
    description:
      'The wishlist keeps models you mean to buy apart from those you own. When they arrive, Move to collection puts them on your shelf.',
    placement: 'top',
    next: 'collection-exchange',
    nextLabel: 'Next',
  },
  'collection-exchange': {
    task: 'collection',
    target: 'collection-exchange',
    page: 'collection',
    href: '/collection',
    title: 'Use a spreadsheet',
    description:
      'Export CSV saves your shelf and wishlist as a spreadsheet. Import CSV shows what a file will change before it adds anything.',
    placement: 'bottom-end',
    final: true,
  },
}

const onboardingFocusSchema = z
  .object({ task: z.enum(onboardingTaskIds), step: z.enum(onboardingStepIds) })
  .refine(({ task, step }) => ONBOARDING_UI[step].task === task)

export function openOnboarding(task: OnboardingTaskId, step?: OnboardingStepId) {
  window.dispatchEvent(new CustomEvent<OnboardingFocus>(ONBOARDING_EVENT, { detail: { task, step: step ?? FIRST_ONBOARDING_STEP[task] } }))
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

/** Optional controls can be absent without the guide losing its place. */
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
  const currentStep = ONBOARDING_UI[step]
  if (currentStep.entry) return currentStep.entry
  const first = FIRST_ONBOARDING_STEP[currentStep.task]
  let entry = first
  for (let current: OnboardingStepId | undefined = first; current; current = ONBOARDING_UI[current].next) {
    if (onboardingPage(ONBOARDING_UI[current].href) === ONBOARDING_UI[current].page) entry = current
    if (current === step) break
  }
  return entry
}

export function onboardingPage(pathname: string): OnboardingPage | undefined {
  if (pathname === '/') return 'home'
  if (pathname === '/simulator' || pathname === '/simulator/') return 'simulator'
  if (/^\/battles\/[^/]+\/?$/.test(pathname)) return 'battle'
  if (pathname === '/friends') return 'friends'
  if (pathname === '/rosters' || pathname === '/rosters/') return 'rosters'
  if (/^\/rosters\/[^/]+\/?$/.test(pathname)) return 'roster'
  if (pathname === '/battles' || pathname === '/battles/') return 'battles'
  if (pathname === '/tournaments' || pathname === '/tournaments/') return 'tournaments'
  // The sample is not a tournament the tour can run on.
  if (/^\/tournaments\/sample\/?$/.test(pathname)) return undefined
  if (/^\/tournaments\/[^/]+\/?$/.test(pathname)) return 'tournament'
  if (pathname === '/groups' || pathname === '/groups/') return 'groups'
  if (/^\/groups\/[^/]+\/?$/.test(pathname)) return 'group'
  if (pathname === '/collection' || pathname === '/collection/') return 'collection'
  return undefined
}
