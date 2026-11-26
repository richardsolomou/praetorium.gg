import { agentSkills } from './agentSkills'

export const PRAETORIUM_GUIDE = {
  product: 'Praetorium is a free and open source Warhammer 40,000 army builder, combat simulator and battle tracker.',
  capabilities: [
    'Build, import, validate, save, share, print, and export catalogue-backed rosters.',
    'Compare shooting and melee, equipment alternatives, and destruction probabilities in the free combat simulator.',
    'Read the docs at /docs for army building, roster imports, combat comparisons, battle tracking, and AI assistant setup.',
    'Set up and track 1v1, 2v1, and 2v2 battles, including missions, phases, command points, scoring, casualties, undo, and corrections.',
    'Run public or private sealed-roster tournaments, and groups with a standing table.',
    'Run Swiss rounds in one-on-one tournaments: Praetorium pairs each round and keeps the Swiss standings.',
    'Watch live or finished public battles and read public leaderboards, profiles, and rosters.',
  ],
  boundaries: [
    'Praetorium does not provide matchmaking, chat, tournament brackets, locations, or rules written by this project.',
    'Build a visitor roster and use the standalone combat simulator without an account. Visitor drafts stay on this device across visits; sign in to save them to your account or open them on other devices. Visitors can also import roster text. An account is required to play battles.',
    'Docs, reference pages, public battles, profiles, and leaderboards can be read without an account.',
    'The combat simulator estimates supported effects for the chosen matchup; players determine range, visibility, and activated effects. Unsupported calculations remain explicit.',
    'Battles are public. Watching never grants a seat or controls.',
    'The MCP reference and combat simulator tools are public. Optional account sign-in adds tools for saved rosters, battles, the player’s collection, and the groups, leagues, tournaments and hidden-list games they play in, including edits and battle actions.',
    'Supported browser assistants can use the same capabilities through WebMCP. Browser account writes require the player to review and approve the proposed change on the page; assistants must never approve their own changes.',
  ],
  dataModel: [
    'Game data is fetched from verified community snapshots and does not live in the repository.',
    'Reference results carry canonical URLs, source revisions, and attribution.',
    'Praetorium returns names, numbers, points, computed results, and a ruleSummary for each rule, ability, stratagem, enhancement, detachment rule, mission card and core rule it has one for: Praetorium’s own wording of that rule, written for Praetorium, never the official text. Answer rules questions from these summaries, and say when a rule has none. A rule with no summary lists textSources instead: the pinned upstream file, its source, and the record id that print its words.',
    'Missing, conflicting, or unavailable source facts remain explicit. They must not be repaired or guessed from model memory.',
    'Battle state is derived from an append-only command log rather than stored as a second mutable score or phase.',
  ],
  agentWorkflow: [
    'Praetorium’s data is Warhammer 40,000 11th edition, kept current with each points and datasheet update. What you remember of the game is mostly earlier editions and older points, so take every rule, point, unit size, limit, mission and stratagem from the tools, never from memory.',
    `Before a task one of these skills covers, call get_skill with its name and follow it: ${agentSkills.map((skill) => skill.name).join(', ')}. Each carries the Warhammer 40,000 knowledge and the tool order for its task.`,
    'Use list_reference to discover factions, rule documents, mission packs, kinds, and the active snapshot.',
    'For roster planning, call list_units once with the faction, battle size, and optional detachment to get unit-size costs, composition, attachments, limits, and detachment rules instead of reading every datasheet; for a large faction such as a Space Marine chapter, narrow it with query. To review a saved list, read get_my_roster’s summary instead of resolving its catalogue ids. Set each unit’s Warlord, enhancement and wargear with ids from get_unit_options. Check a draft with check_roster before saving it, and use grade_roster to say what a list does well or lacks instead of judging it yourself; its grades measure which jobs a list covers, not how strong it is. For what wins, call list_winning_lists for a faction’s top-four tournament lists and the units they field, and get_winning_list for one as a draft; learn from them rather than from memory, and say how many lists a claim rests on. Turn pasted list text into a draft with import_roster, and a list into text for an event with export_roster.',
    'To compare two units in combat, call simulate_combat with unit ids from list_units instead of calculating odds yourself; report refused or notCalculated rules rather than estimating them, and when the player wants one calculated, offer to report it with send_feedback. To field a unit from a saved roster, pass its pick’s models, choices and spreads. For the best wargear against a target, call optimize_loadout, and to choose an enhancement within the points a list has spare, compare_enhancements; to run every unit of one list against every unit of another, call compare_rosters.',
    'For a mission pairing, call get_mission_matchup with both force dispositions; it uses the current pack unless you name another. For what changed in a points or datasheet update, call list_data_updates.',
    'For a signed-in player’s history, filter list_my_battles; for their win rates and leaderboard places, call get_my_stats. To see what other players build and how their games go, list_public_rosters and list_public_battles read what players have made public, without an account; open one with get_public_roster or get_public_battle. To join a battle, read get_battle_invite and confirm the host and side before join_battle. Before recording anything in a battle, read get_my_battle: its next field says what the battle expects and which commands it accepts now. For groups, leagues, tournaments and hidden-list games, start from list_my_events, get_my_group or get_my_event. Read get_league_fixtures before reporting a league score. Ask the player before making a change, naming the roster, players or event and what will change.',
    'Use search_reference to find a record by name or number, then get_reference or get_reference_record before answering, and answer from each rule’s ruleSummary. Say that it is Praetorium’s summary, not the official text, when the exact wording matters.',
    'Use faction, pack, and document filters when names or rule numbers are ambiguous.',
    'Cite the canonical URL and preserve the result attribution. Say when the source does not provide an answer.',
  ],
} as const

export const PRAETORIUM_MCP_INSTRUCTIONS = [
  PRAETORIUM_GUIDE.product,
  'Public reference tools work without signing in. Account tools require OAuth sign-in; read, change and management access have separate scopes.',
  ...PRAETORIUM_GUIDE.agentWorkflow,
  PRAETORIUM_GUIDE.dataModel[2],
  PRAETORIUM_GUIDE.dataModel[3],
].join(' ')

export function praetoriumGuideMarkdown() {
  const section = (title: string, lines: readonly string[]) => `## ${title}\n\n${lines.map((line) => `- ${line}`).join('\n')}`
  return [
    '# Praetorium guide',
    PRAETORIUM_GUIDE.product,
    section('What it does', PRAETORIUM_GUIDE.capabilities),
    section('Product boundaries', PRAETORIUM_GUIDE.boundaries),
    section('Data and trust model', PRAETORIUM_GUIDE.dataModel),
    section('Agent workflow', PRAETORIUM_GUIDE.agentWorkflow),
  ].join('\n\n')
}
