import { AccountRepository } from './repository/accounts'
import { RepositoryArea } from './repository/area'
import { BattleRepository } from './repository/battles'
import { CollectionRepository } from './repository/collection'
import { FriendRepository } from './repository/friends'
import { GroupRepository } from './repository/groups'
import { PreferenceRepository } from './repository/preferences'
import { RosterRepository } from './repository/rosters'
import { SealedEventRepository } from './repository/sealedEvents'
import { StandingsRepository } from './repository/standings'

export type { BattleCard, BattleHistory, BattleSeats } from './repository/battles'
export type { SealedEventSchedule } from './repository/sealedEvents'

const AREAS = [
  AccountRepository,
  FriendRepository,
  PreferenceRepository,
  SealedEventRepository,
  GroupRepository,
  RosterRepository,
  CollectionRepository,
  BattleRepository,
  StandingsRepository,
]

export type SpacetimeRepository = AccountRepository &
  FriendRepository &
  PreferenceRepository &
  SealedEventRepository &
  GroupRepository &
  RosterRepository &
  CollectionRepository &
  BattleRepository &
  StandingsRepository

class Repository extends RepositoryArea {}

// Each data area keeps its methods in its own module; the one repository callers hold carries them all on its prototype.
for (const area of AREAS) {
  for (const name of Object.getOwnPropertyNames(area.prototype)) {
    if (name === 'constructor') continue
    if (Object.hasOwn(Repository.prototype, name)) throw new Error(`Repository method ${name} is in two data areas`)
    Object.defineProperty(Repository.prototype, name, Object.getOwnPropertyDescriptor(area.prototype, name)!)
  }
}

export const SpacetimeRepository = Repository as new (...args: ConstructorParameters<typeof RepositoryArea>) => SpacetimeRepository

export type RepositoryPort = Pick<SpacetimeRepository, keyof SpacetimeRepository>
