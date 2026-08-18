const FACTION_COLOURS: Record<string, string> = {
  'adepta-sororitas': '#a6192e',
  'adeptus-custodes': '#bf9b30',
  'adeptus-mechanicus': '#9f322a',
  'adeptus-titanicus': '#bf7340',
  aeldari: '#3078b5',
  'agents-of-the-imperium': '#4a4a4a',
  'astra-militarum': '#5b5a38',
  'black-templars': '#4a4a4a',
  'blood-angels': '#7c1414',
  'chaos-daemons': '#5b2d6e',
  'chaos-knights': '#5c3a42',
  'chaos-space-marines': '#5c3838',
  'dark-angels': '#1a5c40',
  'death-guard': '#8a9550',
  deathwatch: '#3a433a',
  drukhari: '#8a3590',
  'emperors-children': '#c94ec9',
  'genestealer-cults': '#5a3480',
  'grey-knights': '#697a88',
  'imperial-fists': '#d4af37',
  'imperial-knights': '#1a3d71',
  'iron-hands': '#3d4349',
  'leagues-of-votann': '#b5651d',
  necrons: '#3dff7a',
  orks: '#52a828',
  'raven-guard': '#1a1c1e',
  salamanders: '#0b4a2a',
  'space-marines': '#3d5a73',
  'space-wolves': '#7a8fa6',
  't-au-empire': '#1e7490',
  'thousand-sons': '#1da1b8',
  'titanicus-traitoris': '#b83838',
  tyranids: '#7d5492',
  ultramarines: '#204a87',
  'white-scars': '#d42b35',
  'world-eaters': '#c42126',
}

const ICON_BASE = 'https://cdn.jsdelivr.net/gh/Certseeds/wh40k-icon@be230023ff0755d19ffb1a1762658c711c2887f9/src/svgs'
const FALLBACK_ICONS: Record<string, string> = {
  'adeptus-titanicus': `${ICON_BASE}/human_imperium/mechanicum/collegia-titanica.svg`,
  'titanicus-traitoris': `${ICON_BASE}/chaos/titanicus-traitoris.svg`,
}

export function factionColour(id: string) {
  return FACTION_COLOURS[id] ?? '#767e88'
}

export type FactionPresentation = { slug: string; displayName: string; icon: string | null }

export function FactionMark({ id, icon, size = 'md' }: { id: string; icon: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const colour = factionColour(id)
  const source = icon ?? FALLBACK_ICONS[id]

  return (
    <span
      aria-hidden
      style={{ borderColor: colour, backgroundColor: `color-mix(in srgb, ${colour} 16%, transparent)` }}
      className={`${size === 'lg' ? 'size-14 p-2' : size === 'sm' ? 'size-5 p-0.5' : 'size-9 p-1.5'} flex shrink-0 items-center justify-center rounded-full border`}
    >
      {source ? (
        <img src={source} alt="" className="size-full object-contain invert" />
      ) : (
        <span className="size-2 rounded-full" style={{ backgroundColor: colour }} />
      )}
    </span>
  )
}

export function FactionLabel({ faction, chip = false }: { faction: FactionPresentation; chip?: boolean }) {
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 ${chip ? 'chip' : ''}`}
      style={chip ? { borderColor: factionColour(faction.slug) } : undefined}
    >
      <FactionMark id={faction.slug} icon={faction.icon} size="sm" />
      <span className="truncate">{faction.displayName}</span>
    </span>
  )
}
