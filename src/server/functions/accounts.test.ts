import { expect, it, vi } from 'vitest'
import { me, onboardingProgress, updateOnboardingProgress, uploadCollectionPhoto } from './accounts'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  impersonatedBy: null as string | null,
  usesApp: vi.fn(async (_userId: string, opening: boolean) => opening),
  userAgent: '',
}))
vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => new Request('https://praetorium.gg', { headers: { 'user-agent': mocks.userAgent } }),
}))
vi.mock('../rpc', () => ({ rpc: (work: () => unknown) => work(), mutationRpc: (work: () => unknown) => work() }))
vi.mock('../playerSession', () => ({
  requireUserId: async () => 'actor',
  currentUser: async () => ({ id: 'actor', impersonatedBy: mocks.impersonatedBy }),
}))
vi.mock('../rateLimit', () => ({ fixedWindowRateLimit: () => () => undefined }))
vi.mock('../photoScreening', () => ({
  COLLECTION_PHOTO_QUESTIONS: [],
  recordScreening: async (
    _screening: unknown,
    _image: unknown,
    _questions: unknown,
    capture: (properties: Record<string, unknown>) => unknown,
  ) => capture({ outcome: 'scored', model: 'jev', miniature: 0.9 }),
}))
vi.mock('../app', () => ({
  app: () => ({
    collectionPhotos: { upload: async () => 'private-photo-id' },
    repository: {
      onboardingProgress: async () => ({ completedTasks: ['roster'] }),
      updateOnboardingProgress: async () => ({ completedTasks: ['roster'] }),
      usesApp: mocks.usesApp,
    },
    telemetry: { capture: mocks.capture },
  }),
}))

const APP_AGENT = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 PraetoriumNative/1.2.3'

it.each([
  ['the app', APP_AGENT, null, true],
  ['a browser', 'Mozilla/5.0 (iPhone) Safari/605.1.15', null, false],
  ['an administrator viewing as the player in the app', APP_AGENT, 'admin', false],
])('tells from a request by %s whether the app was opened: %#', async (_, userAgent, impersonatedBy, opening) => {
  mocks.userAgent = userAgent
  mocks.impersonatedBy = impersonatedBy
  await (me as unknown as () => Promise<unknown>)()
  expect(mocks.usesApp).toHaveBeenLastCalledWith('actor', opening)
})

it('still answers who is signed in when app use cannot be read', async () => {
  mocks.usesApp.mockRejectedValueOnce(new Error('database is locked'))
  expect(await (me as unknown as () => Promise<unknown>)()).toMatchObject({ id: 'actor', usesApp: false })
})

it('records screening probabilities without the photo or image identifier', async () => {
  const invoke = uploadCollectionPhoto as unknown as (input: { data: { entryId: string; image: string } }) => Promise<unknown>
  await invoke({ data: { entryId: 'private-unit-id', image: 'private-image' } })
  expect(mocks.capture.mock.calls).toEqual([
    ['actor', 'collection_photo_uploaded', { delivery: 'direct' }],
    ['actor', 'collection_photo_screened', { outcome: 'scored', model: 'jev', miniature: 0.9 }],
  ])
})

/** What a build that still offered skipping a task does with the answer. */
function readAsOldBuild(progress: { completedTasks: string[]; skippedTasks: string[] }) {
  return {
    skipped: progress.skippedTasks.includes('roster'),
    saved: [...progress.completedTasks.map((task) => task), ...progress.skippedTasks.map((task) => task)],
    resolved: [...new Set([...progress.completedTasks, ...progress.skippedTasks])],
  }
}

it.each([
  ['read', () => (onboardingProgress as unknown as () => Promise<never>)()],
  [
    'update',
    () =>
      (updateOnboardingProgress as unknown as (input: { data: unknown }) => Promise<never>)({
        data: { operation: 'complete', task: 'reference' },
      }),
  ],
])('keeps an onboarding %s answer readable by an old saved build', async (_name, answer) => {
  expect(readAsOldBuild(await answer())).toEqual({ skipped: false, saved: ['roster'], resolved: ['roster'] })
})
