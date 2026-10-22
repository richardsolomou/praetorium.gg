import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import type { ProductDoc } from '../contracts/productDocs'

/** Each player guide's closest doc; guides that have none lead to the docs index. */
const GUIDE_DOCS: Record<string, ProductDoc['slug'] | null> = {
  '': null,
  'prepare-your-first-game': null,
  'build-a-balanced-army': null,
  'plan-your-scoring': null,
  'build-an-army': 'start-a-list',
  'import-a-roster': 'import-a-list',
  'compare-loadouts': 'change-the-loadout',
  'track-a-battle': 'start-a-battle',
  'connect-an-ai-assistant': 'connect-an-assistant',
}

export const Route = createFileRoute('/guides/$')({
  beforeLoad: ({ params }) => {
    const guide = params._splat ?? ''
    if (!Object.hasOwn(GUIDE_DOCS, guide)) throw notFound()
    const doc = GUIDE_DOCS[guide]
    throw doc ? redirect({ to: '/docs/$docId', params: { docId: doc }, statusCode: 301 }) : redirect({ to: '/docs', statusCode: 301 })
  },
})
