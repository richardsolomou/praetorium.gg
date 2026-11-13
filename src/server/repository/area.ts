import type { SqliteAccountRepository } from '../accountRepository'
import type { SpacetimeOperator } from '../spacetimeOperator'

/** What every data area reads: accounts from the auth database, everything else from SpacetimeDB. */
export class RepositoryArea {
  constructor(
    protected readonly accounts: SqliteAccountRepository,
    protected readonly product: SpacetimeOperator,
  ) {}
}

/** The account behind an id the product data names, which the auth database must still hold. */
export function profileOf<T>(profiles: ReadonlyMap<string, T>, id: string, role: string): T {
  const profile = profiles.get(id)
  if (!profile) throw new Error(`${role} ${id} is missing from auth database`)
  return profile
}
