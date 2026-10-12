import { openLeagueRoster } from '../../functions'
import { CombatDialog } from '../simulator/RosterCombatDialog'
import { RosterCombatComparison, type RosterCombatSource } from '../simulator/RosterCombatComparison'

export function LeagueCombatDialog({
  token,
  eventToken,
  entries,
  viewerId,
  opponentId,
  onClose,
}: {
  token: string
  eventToken: string
  entries: { userId: string; label: string }[]
  viewerId: string
  opponentId: string
  onClose: () => void
}) {
  const sources: RosterCombatSource[] = entries.map((entry) => ({
    id: entry.userId,
    label: entry.label,
    load: async (signal) => {
      const roster = await openLeagueRoster({ data: { token, eventToken, userId: entry.userId }, signal })
      const built = roster?.built
      if (!built?.picks?.length) throw new Error('This revealed roster has no saved loadouts available to simulate.')
      return [
        {
          catalogueId: built.catalogueId,
          detachmentIds: built.detachmentIds ?? [],
          disposition: built.disposition,
          limit: built.limit,
          picks: built.picks,
          pickIndex: 0,
          waivedRules: built.waivedRules ?? [],
          borrowedDetachmentId: null,
          optionalRules: [],
        },
      ]
    },
  }))
  return (
    <CombatDialog onClose={onClose} title="Combat simulator" wide>
      <RosterCombatComparison
        sources={sources}
        initialAttacker={viewerId}
        initialDefender={opponentId}
        sessionKey={`league:${token}:${eventToken}:${viewerId}:${opponentId}`}
      />
    </CombatDialog>
  )
}
