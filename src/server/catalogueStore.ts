import { type FetchRetryOptions, fetchWithRetry } from './fetch'
import { privateR2Client } from './r2Client'

/**
 * Where catalogue snapshots live: Praetorium's private bucket, since a snapshot carries its
 * source files and their rules text. Contributors without its credentials build the
 * catalogue from its pinned sources instead (`just catalogue-materialize`).
 */
export const PRIVATE_CATALOGUE_BASE = 'r2://praetorium-private/catalogue'

const PRIVATE_OBJECT = /^r2:\/\/praetorium-private\/(.+)$/

/** A catalogue artifact from the private bucket, signed, or from a plain HTTP store such as the local development server. */
export async function fetchCatalogueObject(url: string, init: RequestInit = {}, options?: FetchRetryOptions): Promise<Response> {
  if (!url.startsWith('r2://')) return fetchWithRetry(url, init, options)
  const key = PRIVATE_OBJECT.exec(url)?.[1]
  if (!key) throw new Error(`catalogue store ${url} is not Praetorium's private bucket`)
  const store = privateR2Client()
  if (!store)
    throw new Error(
      'Catalogue snapshots are private: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY to read them, or build the catalogue from its sources with `just catalogue-materialize`.',
    )
  // Signed once: a signature stays valid well past every retry's timeout.
  const signed = await store.client.sign(`${store.base}${key}`, { method: init.method ?? 'GET', headers: init.headers })
  return fetchWithRetry(signed.url, { ...init, headers: signed.headers }, options)
}
