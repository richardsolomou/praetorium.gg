import { expect, it, vi } from 'vitest'
import { onboardingProgress, updateOnboardingProgress, uploadCollectionPhoto } from './accounts'

const mocks = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => new Request('https://praetorium.gg') }))
vi.mock('../rpc', () => ({ rpc: (work: () => unknown) => work(), mutationRpc: (work: () => unknown) => work() }))
vi.mock('../playerSession', () => ({ requireUserId: async () => 'actor' }))
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
    },
    telemetry: { capture: mocks.capture },
  }),
}))

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
