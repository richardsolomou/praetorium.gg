import type { CSSProperties } from 'react'
import { editionFamilyId, type CatalogueEdition } from '../../core/catalogueEdition'
import { routeSlug } from '../../core/slug'
import { RulesVersionBadge } from './RulesVersionBadge'

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

export function factionColour(id: string, name?: string) {
  return FACTION_COLOURS[editionFamilyId(id)] ?? (name ? FACTION_COLOURS[routeSlug(name)] : undefined) ?? '#8b918a'
}

export type FactionPresentation = {
  slug: string
  displayName: string
  icon: string | null
  edition?: Pick<CatalogueEdition, 'id' | 'name' | 'status'> | null
}

export function FactionMark({
  id,
  name,
  edition,
  icon,
  size = 'md',
}: {
  id: string
  name?: string
  edition?: FactionPresentation['edition']
  icon: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const colour = factionColour(id, name)
  const mask = icon ? `url(${JSON.stringify(icon)})` : undefined
  const style = {
    backgroundColor: colour,
    maskImage: mask,
    WebkitMaskImage: mask,
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
    clipPath: icon ? undefined : 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
  } as CSSProperties

  const mark = (
    <span
      aria-hidden
      data-faction-mark={id}
      style={style}
      className={`${size === 'lg' ? 'size-14' : size === 'sm' ? 'size-5' : 'size-9'} inline-block shrink-0`}
    />
  )
  return edition ? (
    <span className="relative inline-flex shrink-0">
      {mark}
      <RulesVersionBadge edition={edition} />
    </span>
  ) : (
    mark
  )
}

export function FactionLabel({
  faction,
  chip = false,
  edition = faction.edition,
}: {
  faction: FactionPresentation
  chip?: boolean
  edition?: FactionPresentation['edition']
}) {
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 ${chip ? 'chip' : ''}`}
      style={chip ? { borderColor: factionColour(faction.slug, faction.displayName) } : undefined}
    >
      <FactionMark id={faction.slug} name={faction.displayName} edition={edition} icon={faction.icon} size="sm" />
      <span className="truncate">{faction.displayName}</span>
    </span>
  )
}
