import { openLeagueRoster } from '../../functions'
import { sealedCombatRoster } from '../simulator/rosterCombat'
import { CombatDialog } from '../simulator/RosterCombatDialog'
import { RosterCombatComparison, type RosterCombatSource } from '../simulator/RosterCombatComparison'
import type { RosterOwner } from '../simulator/rosterOwners'

/** A fixed doubles pair, compared as both of its sealed lists together. */
type LeagueCombatTeam = { id: string; label: string; userIds: string[] }

/** Your team against your opponent's, or single lists when either player has no pair or the opponent is your teammate. */
export function leagueCombatPairing(teams: readonly LeagueCombatTeam[], viewerId: string, opponentId: string) {
  const teamOf = (userId: string) => teams.find((team) => team.userIds.includes(userId))
  const own = teamOf(viewerId)
  const other = teamOf(opponentId)
  if (own && own === other) return { attacker: viewerId, defender: opponentId }
  return { attacker: own?.id ?? viewerId, defender: other?.id ?? opponentId }
}

export function LeagueCombatDialog({
  token,
  eventToken,
  entries,
  teams,
  viewerId,
  opponentId,
  onClose,
}: {
  token: string
  eventToken: string
  entries: { userId: string; label: string; owner: RosterOwner }[]
  teams: LeagueCombatTeam[]
  viewerId: string
  opponentId: string
  onClose: () => void
}) {
  const sealed = async (userId: string, signal: AbortSignal) => {
    const roster = sealedCombatRoster(await openLeagueRoster({ data: { token, eventToken, userId }, signal }))
    if (!roster) throw new Error('This revealed roster has no saved loadouts available to simulate.')
    return roster
  }
  const ownerOf = (userId: string) => entries.find((entry) => entry.userId === userId)?.owner
  const sources: RosterCombatSource[] = [
    ...teams.map((team) => ({
      id: team.id,
      label: team.label,
      owners: team.userIds.flatMap((userId) => ownerOf(userId) ?? []),
      load: (signal: AbortSignal) =>
        Promise.all(team.userIds.map(async (userId) => ({ ...(await sealed(userId, signal)), owner: ownerOf(userId) }))),
    })),
    ...entries.map((entry) => ({
      id: entry.userId,
      label: entry.label,
      owners: [entry.owner],
      load: async (signal: AbortSignal) => [await sealed(entry.userId, signal)],
    })),
  ]
  const pairing = leagueCombatPairing(teams, viewerId, opponentId)
  return (
    <CombatDialog onClose={onClose} wide>
      <RosterCombatComparison
        sources={sources}
        initialAttacker={pairing.attacker}
        initialDefender={pairing.defender}
        sessionKey={`league:${token}:${eventToken}:${viewerId}:${opponentId}`}
        eventPairing
      />
    </CombatDialog>
  )
}
