import { afterEach, expect, it } from 'vitest'
import { setLiveProductRefresh } from '../liveProductRefresh'
import { publicBattlesQuery } from './battles'

afterEach(() => setLiveProductRefresh(false))

const interval = () => (publicBattlesQuery().refetchInterval as () => number | false)()

it('polls the public feed on a page without realtime refresh', () => {
  expect(interval()).toBe(20_000)
})

it('leaves the public feed to realtime refresh when it is running', () => {
  setLiveProductRefresh(true)
  expect(interval()).toBe(false)
})
