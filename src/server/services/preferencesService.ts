import type { PlayerDefaults } from '../../core/playerDefaults'
import type { RecentMatchup } from '../../core/recentMatchups'
import { ABILITY_REMINDERS_FULL, type AbilityReminder } from '../../core/reminders'
import type { PushPlatform } from '../../core/notificationConfig'
import { simulatorPairing } from '../../contracts/simulatorState'
import { describeNotices } from '../pushNotifier'
import type { RepositoryPort } from '../spacetimeRepository'

export class PreferencesService {
  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
  ) {}

  /** The signed-in player's notices, newest first, each in the words and with the page a push would carry. */
  async notices(userId: string) {
    const stored = await this.repository.noticesByUser(userId, this.clock())
    const described = await describeNotices(this.repository, stored)
    return stored.flatMap((notice, index) => {
      const message = described[index]
      return message ? [{ id: notice.id, kind: notice.kind, ...message, at: notice.at, read: notice.readAt !== null }] : []
    })
  }

  markNoticesRead(userId: string, ids: readonly string[]) {
    return this.repository.markNoticesRead(userId, ids, this.clock())
  }

  setPushEnabled(userId: string, enabled: boolean) {
    return this.repository.setPushEnabled(userId, enabled, this.clock())
  }

  setPlayerDefaults(userId: string, defaults: PlayerDefaults) {
    return this.repository.setPlayerDefaults(userId, defaults, this.clock())
  }

  /** The standalone simulator pairings this player reopened most recently, newest first. */
  async recentMatchups(userId: string): Promise<RecentMatchup[]> {
    return (await this.repository.recentMatchupsByUser(userId)).map(({ shared, attacker, defender }) => ({ shared, attacker, defender }))
  }

  rememberMatchup(userId: string, matchup: RecentMatchup) {
    const pairing = simulatorPairing(matchup.shared)
    if (!pairing) throw new Error('Choose both units before remembering a matchup.')
    return this.repository.rememberMatchup({ userId, pairing, ...matchup, now: this.clock() })
  }

  async forgetMatchup(userId: string, shared: string) {
    const pairing = simulatorPairing(shared)
    if (pairing) await this.repository.forgetMatchup(userId, pairing)
  }

  async setAbilityReminder(userId: string, reminder: AbilityReminder) {
    if ((await this.repository.saveAbilityReminder(userId, reminder, this.clock())) === 'full')
      throw new Response(ABILITY_REMINDERS_FULL, { status: 409 })
  }

  registerPushDevice(userId: string, device: { token: string; platform: PushPlatform }) {
    return this.repository.registerPushToken({ userId, ...device, now: this.clock() })
  }
}
