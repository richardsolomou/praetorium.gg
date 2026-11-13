import { isAdminUserCountSort, type AdminUser, type AdminUserCountSort, type AdminUserPage, type AdminUsersRequest } from '../../admin'
import { chunks } from '../../core/collections'
import type { SqliteAccountRepository } from '../accountRepository'
import type { SpacetimeOperator } from '../spacetimeOperator'
import { profileOf, RepositoryArea } from './area'

const ADMIN_USER_COUNT_FIELDS = {
  rosters: 'rosterCount',
  battles: 'battleCount',
  friends: 'friendCount',
  sealedEvents: 'sealedEventCount',
} as const satisfies Record<AdminUserCountSort, keyof AdminUser>

type ProductStat = ReturnType<Awaited<ReturnType<SpacetimeOperator['productStats']>>['get']>

function productCounts(stat: ProductStat) {
  return {
    rosterCount: stat?.rosterCount ?? 0,
    battleCount: stat?.battleCount ?? 0,
    sealedEventCount: stat?.tournamentCount ?? 0,
    friendCount: stat?.friendCount ?? 0,
  }
}

function withProductStats<Row extends Omit<AdminUser, (typeof ADMIN_USER_COUNT_FIELDS)[AdminUserCountSort]>>(
  rows: Row[],
  stats: Awaited<ReturnType<SpacetimeOperator['productStats']>>,
) {
  return rows.map((row) => ({ ...row, ...productCounts(stats.get(row.id)) }))
}

/** Accounts from the auth database, with the product counts and practice opponents SpacetimeDB adds. */
export class AccountRepository extends RepositoryArea {
  syncReceipt(...args: Parameters<SpacetimeOperator['syncReceipt']>) {
    return this.product.syncReceipt(...args)
  }

  userById(id: string) {
    return this.accounts.userById(id)
  }

  admins() {
    return this.accounts.admins()
  }

  async adminUsers(input: Partial<AdminUsersRequest> = {}): Promise<AdminUserPage> {
    const practice = await this.product.practiceOpponentIds()
    const sort = input.sort ?? 'joined'
    if (!isAdminUserCountSort(sort)) {
      const page = await this.accounts.adminUserRows({ ...input, sort }, practice)
      return { users: withProductStats(page.users, await this.product.productStats(page.users.map((row) => row.id))), total: page.total }
    }
    const ids = await this.accounts.adminUserIds(input, practice)
    const stats = new Map(
      (await Promise.all(chunks(ids, 100).map((batch) => this.product.productStats(batch)))).flatMap((batch) => [...batch]),
    )
    const field = ADMIN_USER_COUNT_FIELDS[sort]
    const count = (id: string) => productCounts(stats.get(id))[field]
    // A stable sort keeps tied players newest first.
    const ranked = ids.toSorted((a, b) => ((input.descending ?? true) ? count(b) - count(a) : count(a) - count(b)))
    const pageSize = input.pageSize ?? 25
    const start = (input.page ?? 0) * pageSize
    return { users: withProductStats(await this.accounts.adminUsersByIds(ranked.slice(start, start + pageSize)), stats), total: ids.length }
  }

  unlinkAccount(...args: Parameters<SqliteAccountRepository['unlinkAccount']>) {
    return this.accounts.unlinkAccount(...args)
  }

  profileByUserId(id: string) {
    return this.accounts.profileByUserId(id)
  }

  isAdmin(id: string) {
    return this.accounts.isAdmin(id)
  }

  usesApp(userId: string, opening: boolean) {
    return this.accounts.usesApp(userId, opening)
  }

  githubSponsorship(userId: string) {
    return this.accounts.githubSponsorship(userId)
  }

  namesByIds(ids: readonly string[]) {
    return this.accounts.namesByIds(ids)
  }

  profilesByIds(ids: readonly string[]) {
    return this.accounts.profilesByIds(ids)
  }

  async searchPlayers(userId: string, query: string) {
    const [relationships, practiceIds] = await Promise.all([this.product.friendshipsByUser(userId), this.product.practiceOpponentIds()])
    const excluded = new Set([
      ...practiceIds,
      ...relationships.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId)),
    ])
    const found: Awaited<ReturnType<SqliteAccountRepository['searchPlayerRows']>> = []
    let after: { name: string; id: string } | null = null
    for (let page = 0; page < 12 && found.length < 20; page++) {
      const rows = await this.accounts.searchPlayerRows(userId, query, after, 100)
      found.push(...rows.filter((row) => !excluded.has(row.id)).slice(0, 20 - found.length))
      const last = rows.at(-1)
      if (rows.length < 100 || !last) break
      after = { name: last.name, id: last.id }
    }
    return found
  }

  async playerIdsNamed(query: string, viewerId: string | null) {
    return (await this.accounts.searchPlayerRows(viewerId ?? '', query, null, 100)).map((row) => row.id)
  }

  async practiceOpponents() {
    const ids = await this.product.practiceOpponentIds()
    const profiles = await this.accounts.profilesByIds(ids)
    return ids.map((id) => profileOf(profiles, id, 'Practice opponent'))
  }

  linkExternalAccount(...args: Parameters<SpacetimeOperator['linkExternalAccount']>) {
    return this.product.linkExternalAccount(...args)
  }

  externalAccountsByUser(userId: string) {
    return this.product.externalAccountsByUser(userId)
  }

  practiceOpponentIds(...args: Parameters<SpacetimeOperator['practiceOpponentIds']>) {
    return this.product.practiceOpponentIds(...args)
  }
}
