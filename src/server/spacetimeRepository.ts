import { withAccounts } from './repository/accounts'
import { RepositoryArea } from './repository/area'
import { withBattles } from './repository/battles'
import { withCollection } from './repository/collection'
import { withFriends } from './repository/friends'
import { withGroups } from './repository/groups'
import { withPreferences } from './repository/preferences'
import { withRosters } from './repository/rosters'
import { withSealedEvents } from './repository/sealedEvents'
import { withStandings } from './repository/standings'

export type { BattleCard, BattleHistory, BattleSeats } from './repository/battles'
export type { SealedEventSchedule } from './repository/sealedEvents'

/** Each data area lives in `./repository/`; this class composes them over one pair of databases. */
export class SpacetimeRepository extends withStandings(
  withBattles(withCollection(withRosters(withGroups(withSealedEvents(withPreferences(withFriends(withAccounts(RepositoryArea)))))))),
) {}

export type RepositoryPort = Pick<SpacetimeRepository, keyof SpacetimeRepository>
