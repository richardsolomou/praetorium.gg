import { expect, it } from 'vitest'
import { previewDatabase, previewImageRevision } from './dokployPreview'

const revision = 'a'.repeat(40)
const digest = 'b'.repeat(64)

it('uses the pull request database name', () => {
  expect(previewDatabase('624')).toBe('praetorium-pr-624')
})

it('accepts only the requested PR and a digest-pinned revision', () => {
  expect(previewImageRevision(`ghcr.io/richardsolomou/praetorium.gg:preview-pr-624-sha-${revision}@sha256:${digest}`, '624')).toBe(revision)
  expect(() =>
    previewImageRevision(`ghcr.io/richardsolomou/praetorium.gg:preview-pr-625-sha-${revision}@sha256:${digest}`, '624'),
  ).toThrow()
  expect(() => previewImageRevision(`ghcr.io/richardsolomou/praetorium.gg:preview-pr-624-sha-${revision}`, '624')).toThrow()
})
