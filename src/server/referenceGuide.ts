export const PRAETORIUM_GUIDE = {
  product: 'Praetorium is a free and open source Warhammer 40,000 army builder and battle tracker.',
  capabilities: [
    'Build, import, validate, save, share, print, and export catalogue-backed rosters.',
    'Set up and track 1v1, 2v1, and 2v2 battles, including missions, phases, command points, scoring, casualties, undo, and corrections.',
    'Run public or private league registration with sealed roster reveal.',
    'Watch live or finished public battles and read public leaderboards, profiles, and rosters.',
  ],
  boundaries: [
    'Praetorium does not provide matchmaking, chat, tournament pairings, locations, or rules written by this project.',
    'An account is required to play. Public reference pages, public battles, profiles, and leaderboards can be read without one.',
    'Battle visibility is the narrowest setting chosen by anyone seated at the table. Watching never grants a seat or controls.',
    'The reference MCP is public and read-only. It has no account, saved-roster, private-battle, or mutation access.',
  ],
  dataModel: [
    'Game data is fetched from verified community snapshots and does not live in the repository.',
    'Reference results carry canonical URLs, source revisions, and attribution.',
    'Missing, conflicting, or unavailable source facts remain explicit. They must not be repaired or guessed from model memory.',
    'Battle state is derived from an append-only command log rather than stored as a second mutable score or phase.',
  ],
  agentWorkflow: [
    'Use list_reference to discover factions, rule documents, mission packs, kinds, and the active snapshot.',
    'For roster planning, call list_units once with the faction, battle size, and optional detachment to get unit-size costs, composition, attachments, limits, and detachment rules instead of reading every datasheet.',
    'Use search_reference to locate source text, then get_reference or get_reference_record before answering.',
    'Use faction, pack, and document filters when names or rule numbers are ambiguous.',
    'Cite the canonical URL and preserve the result attribution. Say when the source does not provide an answer.',
  ],
} as const

export const PRAETORIUM_MCP_INSTRUCTIONS = [
  PRAETORIUM_GUIDE.product,
  'This server exposes the current verified public game reference only.',
  ...PRAETORIUM_GUIDE.agentWorkflow,
  PRAETORIUM_GUIDE.dataModel[2],
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
