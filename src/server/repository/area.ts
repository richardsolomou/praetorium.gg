import type { SqliteAccountRepository } from '../accountRepository'
import type { SpacetimeOperator } from '../spacetimeOperator'

/** What every data area reads: accounts from the auth database, everything else from SpacetimeDB. */
export class RepositoryArea {
  constructor(
    protected readonly accounts: SqliteAccountRepository,
    protected readonly product: SpacetimeOperator,
  ) {}
}

/** A mixin's base must construct from any arguments; `SpacetimeRepository` keeps the area's own constructor. */
export type RepositoryBase = new (...args: any[]) => RepositoryArea

/** A mixin that gives the repository these operator methods, each called on the operator unchanged. */
export function forwarding<K extends keyof SpacetimeOperator>(names: readonly K[]) {
  return <B extends RepositoryBase>(Base: B) => {
    const Forwarding = class extends Base {}
    for (const name of names)
      Object.defineProperty(Forwarding.prototype, name, {
        value(this: { product: SpacetimeOperator }, ...args: unknown[]): unknown {
          return Reflect.apply(this.product[name], this.product, args)
        },
        writable: true,
        configurable: true,
      })
    return Forwarding as B & (new (...args: any[]) => Pick<SpacetimeOperator, K>)
  }
}

/** The account behind an id the product data names, which the auth database must still hold. */
export function profileOf<T>(profiles: ReadonlyMap<string, T>, id: string, role: string): T {
  const profile = profiles.get(id)
  if (!profile) throw new Error(`${role} ${id} is missing from auth database`)
  return profile
}
