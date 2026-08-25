import Valkey from 'iovalkey'

export { valkeyUrl } from './valkeyConfig'

/**
 * Valkey, which is what "more than one replica" means here.
 *
 * Three things use it, and only one of them is a cache. Centrifugo takes it as
 * its engine, so a command published by one replica reaches a page connected to
 * another. better-auth keeps sessions in it, so validating one is not a Postgres
 * round trip. And the auth limiter counts in it, so a per-IP ceiling is one
 * ceiling across every replica rather than one apiece.
 *
 * Battle state is deliberately absent. The log is the only record of a game, and
 * a cached fold of it would be a second copy free to disagree — the exact thing
 * the domain is shaped to prevent.
 */
export type ValkeyClient = Valkey

export function openValkey(url: string): ValkeyClient {
  return new Valkey(url, {
    // A request must not hang on a server that is not answering. Two attempts
    // and it fails, visibly, rather than holding the connection open.
    maxRetriesPerRequest: 2,
    // Connecting is not part of booting: the app starts and serves whether or
    // not Valkey is reachable yet.
    lazyConnect: true,
  })
}

/**
 * better-auth's secondary storage, spoken in Valkey.
 *
 * Atomic consume and increment operations keep credentials and limits safe
 * across replicas.
 */
export function valkeySecondaryStorage(client: ValkeyClient) {
  return {
    get: (key: string) => client.get(key),
    set: (key: string, value: string, ttl?: number) => (ttl ? client.set(key, value, 'EX', ttl) : client.set(key, value)),
    delete: (key: string) => client.del(key).then(() => undefined),
    /** One command, so a single-use credential cannot be spent twice. */
    getAndDelete: (key: string) => client.getdel(key),
    /**
     * One round trip that both counts and guarantees the window.
     *
     * `EXPIRE ... NX` sets the deadline only when the key has none, so a counter
     * expires a fixed time after it first appeared and later hits never push it
     * out — which is what makes the ceiling a window rather than a ratchet.
     */
    increment: async (key: string, ttl: number) => {
      const results = await client.multi().incr(key).expire(key, ttl, 'NX').exec()
      const counted = results?.[0]?.[1]
      return Number(counted)
    },
  }
}

/** Answers whether Valkey is actually reachable, for the health route. */
export async function valkeyReachable(client: ValkeyClient) {
  return (await client.ping()) === 'PONG'
}
