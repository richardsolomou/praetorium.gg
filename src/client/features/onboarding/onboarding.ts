import { readSessionValue } from '../../storedValue'
import { gettingStartedTaskIds, onboardingTaskIds, type OnboardingProgressOperation, type OnboardingTaskId } from '../../../core/onboarding'
import type { OnboardingTarget } from '../../onboardingTargets'

export const ONBOARDING_FOCUS_EVENT = 'praetorium:onboarding-focus'
export const ONBOARDING_EVENT = 'praetorium:onboarding'
export const ONBOARDING_ADVANCE_EVENT = 'praetorium:onboarding-advance'

export const gettingStartedTasks: Record<(typeof gettingStartedTaskIds)[number], { title: string; description: string }> = {
  roster: {
    title: 'Build your first army',
    description: 'Create a roster, choose its faction and detachment, then add your first unit.',
  },
  simulator: {
    title: 'Try your first matchup',
    description: 'Choose an attacker and a defender, then read the shooting and melee results.',
  },
}

export function onboardingFocusStorageKey(userId: string) {
  return `praetorium:focused-onboarding-step:${userId}`
}

export function storedOnboardingFocus(userId: string): OnboardingFocus | undefined {
  try {
    const stored = JSON.parse(readSessionValue(onboardingFocusStorageKey(userId)) ?? 'null') as Partial<OnboardingFocus> | null
    const task = onboardingTaskIds.find((candidate) => candidate === stored?.task)
    const step = onboardingStepIds.find((candidate) => candidate === stored?.step)
    return task && step && ONBOARDING_UI[step].task === task ? { task, step } : undefined
  } catch {
    return undefined
  }
}

type OnboardingPage = 'home' | 'rosters' | 'roster' | 'friends' | 'battles' | 'battle' | 'simulator' | 'leagues' | 'league'

export const onboardingStepIds = [
  'simulator-attacker',
  'simulator-defender',
  'simulator-results',
  'tools-input',
  'tools-review',
  'tools-finished',
  'tools-import',
  'battle-setup-size',
  'battle-setup-armies',
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
  'battle-format',
  'battle-seats',
  'battle-sides',
  'battle-create',
  'league-start',
  'league-name',
  'league-format',
  'league-options',
  'league-create',
  'league-entrants',
  'league-rosters',
  'league-reveal',
  'league-status',
  'reference-search',
  'community-public',
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
  league: 'league-start',
  reference: 'reference-search',
  community: 'community-public',
  simulator: 'simulator-attacker',
  'roster-tools': 'tools-import',
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
    title: 'Find the table format',
    description:
      'Choose your armies to find the battle format from their saved sizes. Both sides must match; allies split the points evenly. Tournament battles use their preset size. Choose the mission pack here too.',
    placement: 'bottom',
    next: 'battle-setup-armies',
    nextLabel: 'Next',
  },
  'battle-setup-armies': {
    task: 'battle',
    target: 'battle-setup-armies',
    page: 'battle',
    href: '/battles',
    title: 'Bring the armies',
    description:
      'Choose a saved roster for each player you control, including practice opponents. Rosters must match their share of the points and pass legality checks. The guide moves on once every army is chosen.',
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
    description: 'Each seat takes a confirmed friend, a guest you name, or a practice opponent, and nobody can sit in two of them.',
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
    next: 'battle-setup-size',
  },
  'league-start': {
    task: 'league',
    target: 'create-league',
    page: 'leagues',
    href: '/tournaments',
    title: 'Run a tournament',
    description:
      'Everyone seals a roster in secret, the rosters open together, then you play each other and the results build up. A public tournament below can be joined instead.',
    placement: 'bottom-end',
    next: 'league-name',
  },
  'league-name': {
    task: 'league',
    target: 'league-name',
    page: 'leagues',
    href: '/tournaments',
    title: 'Name the tournament',
    description: 'Players see this on the tournaments page and on the invite you send them.',
    placement: 'right',
    next: 'league-format',
    nextLabel: 'Next',
  },
  'league-format': {
    task: 'league',
    target: 'league-format',
    page: 'leagues',
    href: '/tournaments',
    title: 'Format and points',
    description: 'The tournament sets its table shape and the points every roster is built to. They lock once the first roster is sealed.',
    placement: 'right',
    next: 'league-options',
    nextLabel: 'Next',
  },
  'league-options': {
    task: 'league',
    target: 'league-options',
    page: 'leagues',
    href: '/tournaments',
    title: 'Everything else can wait',
    description:
      'A private link anyone can join is the usual start. Open More options for details, a player limit, a public listing, or approving each player.',
    placement: 'right',
    next: 'league-create',
    nextLabel: 'Next',
  },
  'league-create': {
    task: 'league',
    target: 'league-create',
    page: 'leagues',
    href: '/tournaments',
    title: 'Create it',
    description: 'It opens straight away, and you land on its page, where you run the tournament and play in it.',
    placement: 'top',
    next: 'league-entrants',
  },
  'league-entrants': {
    task: 'league',
    target: 'league-entrants',
    page: 'league',
    href: '/tournaments',
    title: 'Your entrants',
    description: 'Requests to join wait above this list. Accepted players appear here, grouped by side or team when the format has them.',
    placement: 'top',
    next: 'league-rosters',
    nextLabel: 'Next',
  },
  'league-rosters': {
    task: 'league',
    target: 'league-rosters',
    page: 'league',
    href: '/tournaments',
    title: 'Before the reveal',
    description:
      'Everyone sees whose roster is sealed, and rosters stay hidden, from you as well. Once every roster is in, you or anyone playing can reveal them.',
    placement: 'bottom',
    next: 'league-reveal',
    nextLabel: 'Next',
  },
  'league-reveal': {
    task: 'league',
    target: 'league-reveal',
    page: 'league',
    href: '/tournaments',
    title: 'Reveal together',
    description: 'One press opens every sealed roster at once, and entrants can start their battles from then on.',
    placement: 'bottom-end',
    next: 'league-status',
    nextLabel: 'Next',
    optional: true,
  },
  'league-status': {
    task: 'league',
    target: 'league-status',
    page: 'league',
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
}

export function openOnboarding(task?: OnboardingTaskId, step?: OnboardingStepId) {
  window.dispatchEvent(
    new CustomEvent<OnboardingFocus | undefined>(ONBOARDING_EVENT, {
      detail: task ? { task, step: step ?? FIRST_ONBOARDING_STEP[task] } : undefined,
    }),
  )
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

export function focusAfterOnboardingOperation(focus: OnboardingFocus | undefined, operation: OnboardingProgressOperation) {
  return operation.operation === 'skip' && operation.task === focus?.task ? undefined : focus
}

export function onboardingPage(pathname: string): OnboardingPage | undefined {
  if (pathname === '/') return 'home'
  if (pathname === '/simulator' || pathname === '/simulator/') return 'simulator'
  if (/^\/battles\/[^/]+\/?$/.test(pathname)) return 'battle'
  if (pathname === '/friends') return 'friends'
  if (pathname === '/rosters' || pathname === '/rosters/') return 'rosters'
  if (/^\/rosters\/[^/]+\/?$/.test(pathname)) return 'roster'
  if (pathname === '/battles' || pathname === '/battles/') return 'battles'
  if (pathname === '/tournaments' || pathname === '/tournaments/') return 'leagues'
  // The sample is not a tournament the tour can run on.
  if (/^\/tournaments\/sample\/?$/.test(pathname)) return undefined
  if (/^\/tournaments\/[^/]+\/?$/.test(pathname)) return 'league'
  return undefined
}
