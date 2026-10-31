import { openSealedEventRoster } from '../../functions'
import { sealedCombatRoster } from '../simulator/rosterCombat'
import { CombatDialog } from '../simulator/RosterCombatDialog'
import { RosterCombatComparison, type RosterCombatSource } from '../simulator/RosterCombatComparison'
import type { RosterOwner } from '../simulator/rosterOwners'

/** Your pair's lists against your opponent's pair, or single lists when either player has no pair or the opponent is your teammate. */
export function sealedEventCombatPairing(teams: readonly (readonly string[])[], viewerId: string, opponentId: string) {
  const teamOf = (userId: string) => teams.find((team) => team.includes(userId))
  const own = teamOf(viewerId)
  const other = teamOf(opponentId)
  if (own && own === other) return { attacker: [viewerId], defender: [opponentId] }
  return { attacker: own ?? [viewerId], defender: other ?? [opponentId] }
}

export function SealedEventCombatDialog({
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
  /** The players in each fixed pair, whose lists start out fighting together. */
  teams: string[][]
  viewerId: string
  opponentId: string
  onClose: () => void
}) {
  const sealed = async (userId: string, signal: AbortSignal) => {
    const roster = sealedCombatRoster(await openSealedEventRoster({ data: { token, eventToken, userId }, signal }))
    if (!roster) throw new Error('This revealed roster has no saved loadouts available to simulate.')
    return roster
  }
  const ownerOf = (userId: string) => entries.find((entry) => entry.userId === userId)?.owner
  const sources: RosterCombatSource[] = entries.map((entry) => ({
    id: entry.userId,
    label: entry.label,
    owners: [entry.owner],
    load: async (signal: AbortSignal) => [{ ...(await sealed(entry.userId, signal)), owner: ownerOf(entry.userId) }],
  }))
  const pairing = sealedEventCombatPairing(teams, viewerId, opponentId)
  return (
    <CombatDialog onClose={onClose} wide>
      <RosterCombatComparison
        sources={sources}
        initialAttacker={pairing.attacker}
        initialDefender={pairing.defender}
        sessionKey={`sealed-event:${token}:${eventToken}:${viewerId}:${opponentId}`}
        eventPairing
      />
    </CombatDialog>
  )
}
