import { beforeEach, expect, it, vi } from 'vitest'
import { reduceBattle } from '../../core/battle'
import { battleClock } from '../../core/battleClock'
import { battleView } from '../../core/battleView'
import { ALICE, NAMES, PLAYERS, log, started } from '../../core/battle.fixtures'
import { Route } from './watch.battles.$token'

const { liveBattle } = vi.hoisted(() => ({ liveBattle: vi.fn() }))
vi.mock('../../server/app', () => ({ app: () => ({ service: { liveBattle } }) }))
beforeEach(() => liveBattle.mockReset().mockResolvedValue(null))

async function read(token = 'battle') {
  const handlers = Route.options.server?.handlers
  if (!handlers || typeof handlers === 'function' || typeof handlers.GET !== 'function') throw new Error('Missing watch handler')
  return handlers.GET({ params: { token } } as never) as Promise<Response>
}

it('answers a battle nobody may watch with an uncached 404', async () => {
  const response = await read()
  expect([response.status, response.headers.get('cache-control')]).toEqual([404, 'no-store'])
})

it('returns only the live counters of a watchable battle', async () => {
  const history = log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }])
  liveBattle.mockResolvedValue({
    view: battleView({ token: 'battle' }, NAMES, reduceBattle(PLAYERS, history), ''),
    clock: battleClock(PLAYERS, history),
  })
  expect(Object.keys(await (await read()).json()).toSorted()).toEqual(
    ['activeSide', 'paused', 'phase', 'round', 'rounds', 'seq', 'sides', 'status', 'turnElapsedMs', 'turnRunning', 'updatedAt'].toSorted(),
  )
})
