// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ROSTER_GROUPING_COOKIE } from '../../../contracts/rosterCookies'
import { useRosterCookieChoice } from './rosterCookie'
import { keptRosterGrouping } from './rosterSort'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function RosterGroups() {
  const [grouping] = useRosterCookieChoice('none', ROSTER_GROUPING_COOKIE, keptRosterGrouping)
  return createElement('main', null, grouping === 'none' ? 'Rosters' : createElement('h2', null, grouping))
}

it('keeps the server markup while applying a grouping cookie that changed before hydration', async () => {
  const container = document.createElement('div')
  container.innerHTML = renderToString(createElement(RosterGroups))
  const serverNode = container.firstElementChild
  // A second tab can write the cookie after the server has rendered this page.
  document.cookie = `${ROSTER_GROUPING_COOKIE}=faction; Path=/`

  let root: Root | undefined
  try {
    await act(async () => {
      root = hydrateRoot(container, createElement(RosterGroups))
    })
    expect(container.firstElementChild).toBe(serverNode)
    expect(container.querySelector('h2')?.textContent).toBe('faction')
  } finally {
    await act(async () => root?.unmount())
    document.cookie = `${ROSTER_GROUPING_COOKIE}=; Max-Age=0; Path=/`
  }
})
