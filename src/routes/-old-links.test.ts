import { isRedirect } from '@tanstack/react-router'
import { expect, it } from 'vitest'
import { PRODUCT_DOCS } from '../contracts/productDocs'
import { MOVED } from './docs.$docId'

type BeforeLoad = (context: { params: Record<string, string>; location: { searchStr: string } }) => unknown

/** Retired public paths, the route that serves each, and where it sends a visitor. */
const OLD_LINKS: [path: string, route: Promise<{ Route: { options: object } }>, params: Record<string, string>, target: object][] = [
  ['/b/abc?side=1', import('./b.$token'), { token: 'abc' }, { href: '/battles/abc?side=1' }],
  ['/r/abc?battle=xyz', import('./r.$id'), { id: 'abc' }, { href: '/rosters/abc?battle=xyz' }],
  ['/p/abc', import('./p.$playerId'), { playerId: 'abc' }, { to: '/friends' }],
  ['/players/abc', import('./players.$playerId'), { playerId: 'abc' }, { to: '/friends' }],
  ['/changes', import('./changes.index'), {}, { to: '/data-updates' }],
  ['/rosters/import', import('./rosters.import'), {}, { to: '/rosters' }],
  ['/journal', import('./journal'), {}, { to: '/battles' }],
  ['/clubs/abc?x=1', import('./clubs.$'), { _splat: 'abc' }, { href: '/groups/abc?x=1' }],
  ['/leagues/abc?event=e', import('./leagues.$token'), { token: 'abc' }, { href: '/tournaments/abc?event=e' }],
]

it.each(OLD_LINKS)('sends %s on to where it lives now', async (path, route, params, target) => {
  const { options } = (await route).Route as { options: { beforeLoad: BeforeLoad } }
  const searchStr = path.includes('?') ? path.slice(path.indexOf('?')) : ''
  const thrown = (() => {
    try {
      options.beforeLoad({ params, location: { searchStr } })
    } catch (error) {
      return error
    }
  })()
  expect(isRedirect(thrown) && thrown.options).toMatchObject(target)
})

it('moves no docs slug a current page still uses', () => {
  expect(PRODUCT_DOCS.filter((doc) => Object.hasOwn(MOVED, doc.slug))).toEqual([])
})
