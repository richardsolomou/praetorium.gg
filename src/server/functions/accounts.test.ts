import { expect, it, vi } from 'vitest'
import { uploadCollectionPhoto } from './accounts'

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
    telemetry: { capture: mocks.capture },
  }),
}))

it('records screening probabilities without the photo or image identifier', async () => {
  const invoke = uploadCollectionPhoto as unknown as (input: { data: { entryId: string; image: string } }) => Promise<unknown>
  await invoke({ data: { entryId: 'private-unit-id', image: 'private-image' } })
  expect(mocks.capture.mock.calls).toEqual([
    ['actor', 'collection_photo_uploaded'],
    ['actor', 'collection_photo_screened', { outcome: 'scored', model: 'jev', miniature: 0.9 }],
  ])
})
