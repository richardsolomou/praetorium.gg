import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Route } from './optimize'

const { catalogueFor, rulesFor, candidates } = vi.hoisted(() => ({ catalogueFor: vi.fn(), rulesFor: vi.fn(), candidates: vi.fn() }))
vi.mock('../../../server/app', () => ({ app: () => ({ catalogueFor, rulesFor }) }))
vi.mock('../../../shared/combatLoadouts', () => ({ combatLoadoutCandidates: candidates }))
beforeEach(() => {
  vi.stubEnv('APP_URL', 'https://praetorium.gg')
  vi.resetAllMocks()
})
afterEach(() => vi.unstubAllEnvs())

function optimize(origin: string, body: unknown = {}) {
  const handlers = Route.options.server?.handlers
  if (!handlers || typeof handlers === 'function' || typeof handlers.POST !== 'function') throw new Error('Missing optimize handler')
  const request = new Request('https://praetorium.gg/api/simulator/optimize', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return handlers.POST({ request } as never) as Promise<Response>
}

it('refuses a cross-origin optimization before loading the catalogue', async () => {
  const refused = await optimize('https://example.com').catch((thrown: unknown) => thrown)
  expect(refused instanceof Response ? refused.status : refused).toBe(403)
  expect(catalogueFor).not.toHaveBeenCalled()
})

it('lets a same-origin optimization through to input validation', async () => {
  expect((await optimize('https://praetorium.gg')).status).toBe(400)
})

it('streams candidates using the selected codex rules', async () => {
  const selectedRules = { name: 'Preview rules' }
  catalogueFor.mockResolvedValue({ edition: { id: 'preview' } })
  rulesFor.mockImplementation(async (id: string) => (id === 'preview~cat' ? selectedRules : { name: 'Base rules' }))
  candidates.mockImplementation(async function* (_loaded, _data, _signal, rules) {
    yield { rules: rules.name }
  })
  const response = await optimize('https://praetorium.gg', {
    catalogueId: 'preview~cat',
    detachmentIds: [],
    picks: [{ entryId: 'guard' }],
    pickIndex: 0,
  })
  expect(await response.text()).toBe('{"rules":"Preview rules"}\n')
})
