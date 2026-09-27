import { expect, it } from 'vitest'
import { previewImageRevision } from './dokployPreview'

const revision = 'a'.repeat(40)
const digest = 'b'.repeat(64)

it('accepts only the requested PR and a digest-pinned revision', () => {
  expect(previewImageRevision(`ghcr.io/richardsolomou/praetorium.gg-node:preview-pr-624-sha-${revision}@sha256:${digest}`, '624')).toBe(
    revision,
  )
  expect(() =>
    previewImageRevision(`ghcr.io/richardsolomou/praetorium.gg-node:preview-pr-625-sha-${revision}@sha256:${digest}`, '624'),
  ).toThrow()
  expect(() => previewImageRevision(`ghcr.io/richardsolomou/praetorium.gg-node:preview-pr-624-sha-${revision}`, '624')).toThrow()
})
