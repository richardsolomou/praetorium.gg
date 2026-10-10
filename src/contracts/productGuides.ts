export const PRODUCT_GUIDES = [
  {
    slug: 'build-an-army',
    title: 'How to build and check a Warhammer 40,000 army list',
    description:
      'Build a free Warhammer 40,000 army list in Praetorium, check points and supported restrictions, then save it to your account.',
    steps: [
      {
        title: 'Choose your army and game size',
        text: 'Open Rosters, pick a faction and battle size, and choose your detachments. Select Start building to open the list. You can try the builder without an account.',
      },
      {
        title: 'Add units and choose their equipment',
        text: 'Search the unit picker and add units to your roster. Adjust model counts and open each unit’s loadout to choose equipment, enhancements and supported options. Attach eligible Leaders and Support models to their squads so the list is checked in that context.',
      },
      {
        title: 'Review points and validation messages',
        text: 'The builder updates points and checks supported catalogue restrictions as you edit. Review any unit, detachment or force disposition errors before taking the list to a game. If a restriction cannot be evaluated, Praetorium reports the missing information rather than claiming the list is legal.',
      },
      {
        title: 'Save the list to your account',
        text: 'A visitor’s draft stays on this device. Use Save roster and sign in or create an account to keep it with your saved lists and open it on other devices. Browser storage can be cleared, so save important lists to your account. Saved lists update as you edit and can be shared, printed or exported from their roster actions.',
      },
    ],
    questions: [
      {
        question: 'Is the army builder free?',
        answer: 'Yes. Every Praetorium feature is free, with no subscription or paid feature tier.',
      },
      {
        question: 'Do I need an account to build an army?',
        answer:
          'No. You can build a list as a visitor. The draft stays on this device across visits. An account is required to save it to your library, open it on another device, import a roster or play a battle.',
      },
      {
        question: 'Does validation cover every rule?',
        answer:
          'No. Validation uses verified community data and supports the restrictions that data can represent. Read any warnings and check unresolved restrictions against your game’s rules and event requirements.',
      },
    ],
    example: {
      title: 'Try a five-model Immortals draft',
      steps: [
        'Choose Necrons, Strike Force, Awakened Dynasty and Take and Hold, then select Start building.',
        'Search for Immortals and add one unit. Open its card: the initial squad has five models. Review its points and loadout before adding the rest of the army.',
        'Reload the page or reopen Rosters in another tab on the same device to check that the draft returns. This is a first unit, not a complete army: resolve the builder’s validation messages and use Save roster to keep it with your account.',
      ],
      image: '/guides/build-an-army-4df98ae9.png',
      imageAlt: 'A visitor’s Necrons draft with an Immortals unit, model controls and loadout panel.',
      imageWidth: 1440,
      imageHeight: 1045,
      caption: 'The roster and its loadout share one workspace; points update as you change the unit.',
    },
    action: { to: '/rosters', label: 'Open the army builder' },
  },
  {
    slug: 'import-a-roster',
    title: 'How to import a Warhammer 40,000 roster',
    description:
      'Import Games Workshop roster text from Praetorium, BattleBase or New Recruit, and review unmatched units and equipment before saving.',
    steps: [
      {
        title: 'Copy a supported text export',
        text: 'Export your list in Games Workshop text format from Praetorium, BattleBase or New Recruit. Copy the complete export, including its faction, detachments, game size, unit names and equipment.',
      },
      {
        title: 'Paste it into Import roster',
        text: 'Open Rosters and choose Import roster. Paste the export into Roster text, then choose Import pasted roster. You can try this without an account. Praetorium matches the text to its current community catalogue.',
      },
      {
        title: 'Review anything that could not be matched',
        text: 'If the faction cannot be identified, the import stops. For a recognised faction, the review names units that will not be imported and choices that could not be applied. Use Edit pasted text to correct them, or accept the incomplete list after reading what will arrive. Visitors choose Open imported draft; signed-in players choose Import anyway when there are unmatched choices.',
      },
      {
        title: 'Check and save the result',
        text: 'Compare the imported units, model counts, equipment, detachments and points with the original list. Resolve validation messages and choose a force disposition if required. A guest draft stays on this device; choose Save roster and sign in to keep it in your account. Keep the original export until you have checked the result.',
      },
    ],
    questions: [
      {
        question: 'Can I import a .ros or .rosz file?',
        answer:
          'No. Praetorium imports supported roster text. Export the list in Games Workshop text format and paste it into the import dialog.',
      },
      {
        question: 'Why can points differ from my original export?',
        answer:
          'Imported choices are rebuilt and priced against Praetorium’s current catalogue. A source update or an unmatched option can change the total. Review the import messages and the saved loadouts.',
      },
      {
        question: 'Does the importer silently drop unknown units?',
        answer: 'No. Unknown units and unapplied choices are shown for review before you accept an incomplete import.',
      },
    ],
    example: {
      title: 'Copy an Immortals list into a second roster',
      steps: [
        'Create a Necrons roster with Awakened Dynasty and add one Immortals unit. In Roster actions, choose Export GW text and copy the complete export.',
        'Return to Rosters, choose Import roster and paste that export into Roster text. Keep the title, faction, detachment, battle size and equipment lines together.',
        'Choose Import pasted roster, then open the saved list and check that it contains one Immortals unit. Compare its model count and equipment with the original; do not judge a successful import by its title alone.',
      ],
      image: '/guides/import-a-roster-63c1fccd.png',
      imageAlt: 'The Import roster dialog containing a complete Games Workshop text export for an Immortals example list.',
      imageWidth: 756,
      imageHeight: 498,
      caption: 'Paste the complete text export. The imported list is checked against the current catalogue.',
    },
    action: { to: '/rosters', label: 'Open Rosters to import' },
  },
  {
    slug: 'compare-loadouts',
    title: 'How to compare Warhammer 40,000 unit loadouts',
    description:
      'Use Praetorium’s free combat simulator to compare shooting and melee, change equipment, and inspect damage and destruction probabilities.',
    steps: [
      {
        title: 'Choose an attacker and defender',
        text: 'Open Simulator and choose a unit for each side. No account is needed. Adjust model counts and add eligible Leaders or Support models when they are part of the matchup.',
      },
      {
        title: 'Set equipment and relevant effects',
        text: 'Open Loadout for each member to choose equipment. Review Rules & buffs and apply the effects that are actually active. Use manual modifiers for the situation you want to test, and confirm the selected weapon profiles. The simulator cannot decide range, visibility or which effects you activated at the table.',
      },
      {
        title: 'Read each phase and the combined result',
        text: 'Results update as you change the matchup. Inspect average wounds and models lost, destruction probability and the Breakdown. Shooting alone and melee alone each start at the defender’s current health; the combined result carries shooting’s survivors into melee.',
      },
      {
        title: 'Compare legal equipment alternatives',
        text: 'Open a member’s loadout to compare alternative weapon odds, or use Optimize to search legal equipment combinations while holding model counts fixed. Review any calculation limits or unsupported effects. Standalone shared links retain the selected units and loadouts; roster experiments leave the saved army unchanged.',
      },
    ],
    questions: [
      {
        question: 'Is the combat simulator free without an account?',
        answer: 'Yes. The standalone simulator works without signing in and has no subscription.',
      },
      {
        question: 'Does the result predict what will happen in my game?',
        answer:
          'It gives probabilities for the selected matchup and supported effects. Dice outcomes vary, and board position, visibility, range and tactical choices still matter.',
      },
      {
        question: 'What happens when an ability is unsupported?',
        answer:
          'Praetorium reports unsupported calculations rather than inventing an effect. Review those messages before relying on an estimate.',
      },
    ],
    example: {
      title: 'Compare gauss blasters and tesla carbines',
      steps: [
        'Choose Immortals as Attacker and Necron Warriors as Defender. Keep both model counts and the defender’s equipment unchanged throughout the comparison.',
        'Read the shooting result for the initial gauss blasters. Open the attacker’s Loadout and select Tesla carbine. The shooting result now shows five tesla carbines.',
        'Compare the shooting destruction probability and average models lost before and after the change, with the same effects active. Use Breakdown for the full distribution; a higher average does not necessarily mean a higher chance to destroy the whole unit.',
        'Keep the resulting standalone link and reload it. The five-model tesla carbine loadout returns, so you can repeat the comparison against another defender without rebuilding it.',
      ],
      image: '/guides/compare-loadouts-f79d660e.png',
      imageAlt: 'The combat simulator comparing five Immortals with tesla carbines against Necron Warriors.',
      imageWidth: 1440,
      imageHeight: 1100,
      caption:
        'This is an example matchup, not a fixed damage prediction. Results follow the selected models, equipment, effects and current data.',
    },
    action: { to: '/simulator', label: 'Open the combat simulator' },
  },
  {
    slug: 'track-a-battle',
    title: 'How to track a Warhammer 40,000 battle',
    description:
      'Set up a friend or practice battle in Praetorium, track phases, scores and command points together, then review the finished game.',
    steps: [
      {
        title: 'Sign in and choose who is playing',
        text: 'Save your army lists, then open Battles and choose New battle. Pick 1v1, 2v1 or 2v2 and fill the player seats. Add friends before seating them, or choose a practice opponent to play on your own. Choose Start battle to open setup.',
      },
      {
        title: 'Complete the shared setup',
        text: 'Select each player’s army, align the game sizes, choose a mission pack and battlefield, and complete the setup prompts. Confirm the first turn before starting play. The armies attached to the battle are frozen snapshots, so later list edits do not rewrite the game.',
      },
      {
        title: 'Record the game as you play',
        text: 'Advance phases and turns in the tracker and record scores, command points, stratagems and casualties. Seated players can operate the table’s shared controls from their own devices. Allies share their side’s turn and resources. Follow the mission prompts and use Undo or corrections when an action was recorded incorrectly.',
      },
      {
        title: 'Review the finished battle',
        text: 'Open the finished game to read its report and replay turns. Public finished games contribute to player records and standings; practice games do not. Share the battle link only with the audience allowed by the seated players’ visibility settings.',
      },
    ],
    questions: [
      {
        question: 'Do all players need an account?',
        answer:
          'Human players need accounts to play. A practice opponent lets one signed-in player run both sides. Visitors can watch public games without signing in.',
      },
      {
        question: 'Who can watch my battle?',
        answer:
          'The battle uses the most private visibility setting chosen by anyone seated at the table. Watching never grants a seat or permission to change the game.',
      },
      {
        question: 'Does Praetorium offer matchmaking or tournament pairings?',
        answer:
          'No. It tracks games with friends and practice opponents, and supports league registration with sealed rosters. It does not arrange opponents or tournament pairings.',
      },
    ],
    example: {
      title: 'Learn the tracker with a practice turn',
      steps: [
        'Save a test army, then create a 1v1 battle against Practice Opponent. In Setup, select that saved list for each side while learning the controls.',
        'Choose the battlefield and secondary missions, record the first turn and start the battle. Complete the opening mission prompt to reach the command phase.',
        'Select End the command phase and complete any reminder. The scoreboard advances to movement phase while staying in round one. Continue through the phases to practise recording scores and corrections before a game with friends.',
      ],
      image: '/guides/track-a-battle-4c069f11.png',
      imageAlt: 'A practice battle scoreboard showing round one and movement phase after the command phase ends.',
      imageWidth: 1440,
      imageHeight: 90,
      caption: 'A practice opponent lets one signed-in player operate both sides. Practice games do not affect standings.',
    },
    action: { to: '/battles', label: 'Open Battles' },
  },
] as const

export type ProductGuide = (typeof PRODUCT_GUIDES)[number]
