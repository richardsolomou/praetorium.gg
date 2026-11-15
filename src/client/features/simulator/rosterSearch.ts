import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { rosterSourceKey, type SimulatorRosterSource } from '../../../contracts/simulatorState'
import { ROSTER_SEARCH_MAX_LENGTH } from '../../../core/rosterDiscovery'
import { battleQuery, discoveredRostersQuery, playedArmiesQuery, sealedEventRosterQuery, sharedRosterQuery } from '../../queries'
import type { RosterGroup, RosterOption } from './RosterPicker'
import { battleCombatRoster, sealedCombatRoster } from './rosterCombat'
import type { CombatRoster } from './useCombatant'
import { formatAgo } from '../../dates'
import { formatList } from '../../text'

const SEARCH_DELAY_MS = 300
const SEARCH_MIN_LENGTH = 2

/** Any roster a simulator side can name, at full strength from its first unit, or null when it cannot be read. */
export function loadRosterSource(queryClient: QueryClient, source: SimulatorRosterSource): Promise<CombatRoster | null> {
  const loading: Promise<CombatRoster | null> =
    'battle' in source
      ? queryClient.query(battleQuery(source.battle.token)).then((screen) => battleCombatRoster(screen, source.battle.playerId).roster)
      : 'sealedEvent' in source
        ? queryClient
            .query(sealedEventRosterQuery(source.sealedEvent.token, source.sealedEvent.eventToken, source.sealedEvent.userId))
            .then(sealedCombatRoster)
        : queryClient.query(sharedRosterQuery(source.id)).then((roster) => (roster ? { ...roster, pickIndex: 0 } : null))
  return loading.catch(() => null)
}

/** A roster's address, or a list's address in a battle, pasted from anywhere the app runs. */
export function linkedRosterSource(text: string): SimulatorRosterSource | null {
  // Anything pasted is read here on every keystroke, so text that is not a usable address reads as no link rather than throwing.
  try {
    const url = new URL(text.trim(), 'https://praetorium.invalid')
    const id = /^\/rosters\/([^/]+)\/?$/.exec(url.pathname)?.[1]
    if (!id) return null
    const battle = url.searchParams.get('battle')
    return battle ? { battle: { token: battle, playerId: decodeURIComponent(id) } } : { id: decodeURIComponent(id) }
  } catch {
    return null
  }
}

/**
 * Rosters a picker finds beyond the ones it lists: public rosters and armies from finished battles matching what was
 * typed, or the roster a pasted link opens, which also reaches unlisted rosters and lists in a running battle.
 * `listed` keys are left out, since the picker already offers them.
 */
export function useRosterSearch(listed: ReadonlySet<string>, enabled: boolean) {
  const [typed, setTyped] = useState('')
  const [text, setText] = useState('')
  useEffect(() => {
    const wait = setTimeout(() => setText(typed.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(wait)
  }, [typed])
  const linked = linkedRosterSource(text)
  const query = !linked && text.length >= SEARCH_MIN_LENGTH ? text.slice(0, ROSTER_SEARCH_MAX_LENGTH) : null
  // Before anything is typed, the newest few are listed, so a reader with no rosters of their own still has some to pick.
  const browsing = enabled && !linked && !query
  const linkedRoster = useQuery({
    ...sharedRosterQuery(linked && 'id' in linked ? linked.id : ''),
    enabled: Boolean(linked && 'id' in linked),
  })
  const linkedBattle = useQuery({
    ...battleQuery(linked && 'battle' in linked ? linked.battle.token : ''),
    enabled: Boolean(linked && 'battle' in linked),
  })
  const rosters = useInfiniteQuery({
    ...discoveredRostersQuery(query ? { q: query } : {}, 'public', 'updated-desc'),
    enabled: Boolean(query) || browsing,
  })
  const armies = useInfiniteQuery({ ...playedArmiesQuery(query ? { q: query } : {}), enabled: Boolean(query) || browsing })
  const shown = <T>(found: readonly T[] | undefined) => (found ?? []).slice(0, query ? undefined : BROWSE_LIMIT)

  const option = (source: SimulatorRosterSource, label: string, catalogueId: string, description?: string): RosterOption[] => {
    const id = rosterSourceKey(source)
    return listed.has(id) ? [] : [{ id, label, catalogueId, description, found: true }]
  }
  const fromLink = (() => {
    if (!linked) return []
    if ('id' in linked) return linkedRoster.data ? option(linked, linkedRoster.data.name, linkedRoster.data.catalogueId) : []
    if (!('battle' in linked)) return []
    const army = battleCombatRoster(linkedBattle.data, linked.battle.playerId)
    return army.roster ? option({ battle: { ...linked.battle, playerId: army.playerId! } }, army.name, army.roster.catalogueId) : []
  })()
  const groups: RosterGroup[] = !linked
    ? [
        {
          label: query ? 'Public rosters' : 'Recent public rosters',
          // A public roster is read as its owner last saved it.
          options: shown(rosters.data?.pages[0]?.rosters).flatMap(({ roster, owner }) =>
            option({ id: roster.id }, `${roster.name} · ${owner.name}`, roster.catalogueId, `Saved ${formatAgo(roster.updatedAt)}`),
          ),
        },
        {
          label: query ? 'Played armies' : 'Recently played armies',
          options: shown(armies.data?.pages[0]?.armies).flatMap((army) =>
            // One list played many times reads the same each time, so its opponents and day tell the games apart.
            option(
              { battle: { token: army.battle, playerId: army.player.id } },
              `${army.name} · ${army.player.name}`,
              army.catalogueId,
              [
                army.outcome.opponents.length ? `vs ${formatList(army.outcome.opponents.map(({ displayName }) => displayName))}` : null,
                formatAgo(army.playedAt),
              ]
                .filter(Boolean)
                .join(' · '),
            ),
          ),
        },
      ]
    : [{ label: 'From this link', options: fromLink }]
  const searching = typed.trim() !== text || linkedRoster.isFetching || linkedBattle.isFetching || rosters.isFetching || armies.isFetching
  return {
    groups,
    /** What a searchable picker passes its list, so the reader learns what typing finds and what a link adds. */
    props: {
      onSearchChange: setTyped,
      searchPlaceholder: 'Search rosters or players, or paste a link…',
      emptyText: searching ? 'Searching…' : 'No rosters match.',
      note: typed.trim() ? undefined : SEARCH_NOTE,
    },
  }
}

const SEARCH_NOTE = 'Type to search public rosters and played armies, or paste a link.'
const BROWSE_LIMIT = 5
