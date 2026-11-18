import { HOME_WIDGET_ITEMS, type HomeWidget } from '../../../contracts/homeWidget'
import type { Battle } from '../battles/battle'
import { eventFullName } from '../sealedEvents/sealedEvent'
import type { HomeTournament } from './HomeGroups'
import type { LeagueGameDue, RosterDue } from './HomeInProgress'

type Item = HomeWidget['items'][number]

const clip = (text: string) => (text.length > 120 ? `${text.slice(0, 119)}…` : text)
const capitalised = (text: string) => `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`

/** The other side's names in one of the player's games, as the battle cards name them. */
function opponents(battle: Battle, viewerId: string) {
  const seat = battle.playerIds.indexOf(viewerId)
  const side = battle.sides[seat]
  const names = battle.players.filter((_, index) => index !== seat && (side === undefined || battle.sides[index] !== side))
  return names.join(' & ') || 'your opponent'
}

/**
 * What waits on the player, in the order Home's In progress lists it: games under way, league games past their deadline,
 * lists an event needs, league games still to play, then tournaments entered. Only the first few fit on a widget.
 */
export function homeWidget(
  viewerId: string,
  {
    games,
    leagueGames,
    rostersDue,
    tournaments,
  }: {
    games: readonly Battle[]
    leagueGames: readonly LeagueGameDue[]
    rostersDue: readonly RosterDue[]
    tournaments: readonly HomeTournament[]
  },
  now: number,
): HomeWidget {
  const league = (game: LeagueGameDue): Item => ({
    kind: 'league',
    title: clip(`League game against ${game.opponent}`),
    detail: clip(`${game.groupName} · Round ${game.round}`),
    path: `/groups/${encodeURIComponent(game.groupToken)}?tab=league`,
    due: game.deadline,
    urgent: game.overdue,
  })
  const items: Item[] = [
    ...games.map((battle): Item => ({
      kind: 'battle',
      title: clip(`Your game against ${opponents(battle, viewerId)}`),
      // The player's own list tells apart two games against the same opponent.
      detail: clip(
        [
          battle.armies[battle.playerIds.indexOf(viewerId)],
          battle.status === 'setup' ? 'Setting up' : `Round ${battle.round} · ${capitalised(battle.phase)}`,
        ]
          .filter(Boolean)
          .join(' · '),
      ),
      path: `/battles/${encodeURIComponent(battle.token)}`,
      due: null,
      urgent: false,
    })),
    ...leagueGames.filter((game) => game.overdue).map(league),
    ...rostersDue.map((sealedEvent): Item => ({
      kind: 'roster',
      title: clip(`${eventFullName(sealedEvent)} needs your roster`),
      detail: 'Seal your roster',
      path: sealedEvent.group
        ? `/groups/${encodeURIComponent(sealedEvent.group.token)}/games/${encodeURIComponent(sealedEvent.token)}`
        : `/tournaments/${encodeURIComponent(sealedEvent.token)}`,
      due: null,
      urgent: true,
    })),
    ...leagueGames.filter((game) => !game.overdue).map(league),
    // A tournament still waiting for the player's list is already the roster line above.
    ...tournaments
      .filter((tournament) => !rostersDue.some((sealedEvent) => sealedEvent.token === tournament.token))
      .map((tournament): Item => ({
        kind: 'tournament',
        title: clip(tournament.name),
        detail: clip(tournament.status.label),
        path: `/tournaments/${encodeURIComponent(tournament.token)}`,
        due: tournament.playsAt,
        urgent: false,
      })),
  ]
  return { version: 1, updatedAt: now, items: items.slice(0, HOME_WIDGET_ITEMS) }
}
