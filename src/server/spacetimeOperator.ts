import { z } from 'zod'
import { withAchievements } from './spacetimeOperator/achievements'
import { withBattles } from './spacetimeOperator/battles'
import { SpacetimeClient } from './spacetimeOperator/client'
import { withCollection } from './spacetimeOperator/collection'
import { withGroupsAndTournaments } from './spacetimeOperator/groupsAndTournaments'
import { withNotifications } from './spacetimeOperator/notifications'
import { withPreferences } from './spacetimeOperator/preferences'
import { withRosters } from './spacetimeOperator/rosters'
import { withSocial } from './spacetimeOperator/social'
import { withStandings } from './spacetimeOperator/standings'

/** Each operation family lives in `./spacetimeOperator/`; this class composes them over one connection. */
export class SpacetimeOperator extends withGroupsAndTournaments(
  withNotifications(
    withPreferences(withCollection(withRosters(withSocial(withAchievements(withStandings(withBattles(SpacetimeClient))))))),
  ),
) {
  async revokeSession(sessionId: string) {
    if (!sessionId || sessionId.length > 128) throw new Error('Invalid session ID')
    await this.call('revoke_session', [sessionId])
  }

  async health() {
    return this.reply('operator_health', [], z.literal(true))
  }

  async deleteUserData(userId: string) {
    if (!userId || userId.length > 128) throw new Error('Invalid user ID')
    await this.call('delete_user_data', [userId])
  }

  async syncReceipt(id: string, owner: string, fingerprint: string) {
    return this.read(
      'sync_receipt',
      [id, owner, fingerprint],
      z.object({ outcome: z.enum(['applied', 'refused']), message: z.string() }).nullable(),
    )
  }
}
