import { app } from './app'

/** A catalogue the request cannot go on without. */
export async function requireCatalogue(catalogueId: string) {
  const loaded = await app().catalogueFor(catalogueId)
  if (!loaded) throw new Response('army data is not available', { status: 409 })
  return loaded
}
