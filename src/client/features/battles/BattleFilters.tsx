import { useQuery } from '@tanstack/react-query'
import { BATTLE_FILTER_FACETS, BATTLE_SEARCH_MAX_LENGTH, type BattleFacet } from '../../../core/battleFilter'
import { GAME_SIZES, battleSizeOptionLabel } from '../../../core/battle'
import { facetText } from '../../../core/listFilter'
import { FilterBar, type FilterDimension } from '../../components/FilterBar'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import type { SearchableGroup } from '../../components/SearchableSelect'
import { useFavouriteFactions } from '../../favouriteFactions'
import { deploymentsQuery, factionIndexQuery, friendshipsQuery, gameReferencesQuery, opponentsQuery } from '../../queries'
import { facetsOf, periodSearch } from '../../searchParams'
import { factionFamilies } from '../rosters/factionFamilies'
import { factionSelectGroups } from '../rosters/builder/factions'
import type { BattleListSearch, BattlesView } from './battleSearch'

const plain = (items: { label: string; value: string }[]): SearchableGroup[] => [{ label: '', items }]

const STATUS = plain([
  { label: 'Setting up', value: 'setup' },
  { label: 'In progress', value: 'playing' },
  { label: 'Finished', value: 'finished' },
])
const RESULT = plain([
  { label: 'Won', value: 'won' },
  { label: 'Lost', value: 'lost' },
  { label: 'Drawn', value: 'drawn' },
])
const ENDING = plain([
  { label: 'Played to the end', value: 'completed' },
  { label: 'Finished early', value: 'finished-early' },
  { label: 'Conceded', value: 'conceded' },
])
const TYPE = plain([
  { label: 'Practice', value: 'practice' },
  { label: 'With a guest', value: 'guest' },
  { label: 'Team (2v1, 2v2)', value: 'team' },
  { label: 'Manual tracking', value: 'manual' },
  { label: 'Group or tournament', value: 'organised' },
])
const SIZE = plain(GAME_SIZES.map((size) => ({ label: battleSizeOptionLabel(size), value: String(size.limit) })))

export function BattleFilters({
  view,
  search,
  onChange,
  signedIn,
}: {
  view: BattlesView
  search: BattleListSearch
  onChange: (next: BattleListSearch) => void
  signedIn: boolean
}) {
  const mine = view === 'mine'
  const { data: index } = useQuery(factionIndexQuery())
  const { data: references } = useQuery(gameReferencesQuery())
  const { data: deployments } = useQuery(deploymentsQuery())
  const { data: opponents } = useQuery({ ...opponentsQuery(), enabled: mine })
  const { data: friendships } = useQuery({ ...friendshipsQuery(), enabled: view === 'friends' })
  const { favourites } = useFavouriteFactions(signedIn)
  const facets = facetsOf(search, BATTLE_FILTER_FACETS)

  const factions = index?.factions ?? []
  const families = factionFamilies(factions)
  const factionGroups = factionSelectGroups(
    families.map((faction) => ({ ...faction, id: faction.slug })),
    new Set(families.filter((faction) => favourites.has(faction.id)).map((faction) => faction.slug)),
  )
  /** The detachments of the armies chosen, by the name a battle records. */
  const detachmentsOf = (chosen: readonly string[] | undefined): SearchableGroup[] => {
    const names = new Set(
      factions
        .filter((faction) => chosen?.includes(faction.slug))
        .flatMap((faction) => faction.detachments.map((detachment) => detachment.name)),
    )
    return plain([...names].toSorted().map((name) => ({ label: name, value: name })))
  }
  const people = mine ? opponents : friendships?.friends

  const dimensions: FilterDimension[] = [
    { key: 'status', label: 'Status', groups: STATUS, pinned: true },
    ...(mine ? [{ key: 'result', label: 'Result', groups: RESULT, pinned: true }] : []),
    { key: 'faction', label: mine ? 'Your army' : 'Army', groups: factionGroups, pinned: true },
    { key: 'against', label: mine ? 'Opposing army' : 'Against army', groups: factionGroups, pinned: true },
    { key: 'detachment', label: mine ? 'Your detachment' : 'Detachment', groups: detachmentsOf(facets.faction?.in) },
    { key: 'againstDetachment', label: 'Opposing detachment', groups: detachmentsOf(facets.against?.in) },
    {
      key: 'player',
      label: mine ? 'Opponent' : 'Friend',
      groups: [
        {
          label: '',
          items: (people ?? []).map((person) => ({
            label: person.name,
            value: person.id,
            icon: <PlayerAvatar name={person.name} image={person.image} className="size-5 text-3xs" />,
          })),
        },
      ],
    },
    { key: 'size', label: 'Battle size', groups: SIZE, pinned: true },
    { key: 'type', label: 'Kind of game', groups: TYPE },
    { key: 'pack', label: 'Mission pack', groups: plain((references?.packs ?? []).map((pack) => ({ label: pack.name, value: pack.id }))) },
    { key: 'deployment', label: 'Deployment', groups: plain((deployments ?? []).map((zone) => ({ label: zone.name, value: zone.id }))) },
    { key: 'ending', label: 'How it ended', groups: ENDING },
  ]

  return (
    <FilterBar
      scope={`battles:${view}`}
      label="Battle"
      query={search.q ?? ''}
      onQuery={(next) => onChange({ ...search, q: next.trim() || undefined })}
      placeholder="Search players, armies, missions…"
      maxQueryLength={BATTLE_SEARCH_MAX_LENGTH}
      dimensions={dimensions}
      value={facets}
      onChange={(key, facet) => onChange({ ...search, [key as BattleFacet]: facetText(facet) })}
      period={{
        label: mine ? 'Last played' : 'Started',
        value: periodSearch(search),
        onChange: (next) => onChange({ ...search, period: undefined, from: undefined, to: undefined, ...next }),
      }}
      address={search}
      onApply={(address) => onChange(address)}
    />
  )
}
