import type { DokployClient } from 'ras-stack/preview/dokploy'
import { expect, it } from 'vitest'
import { previewDatabase, previewImageRevision, shareCatalogueCache } from './dokployPreview'

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

function dokploy(existing: boolean, mounts: { volumeName: string; mountPath: string }[] = []) {
  const calls: string[] = []
  let created = existing
  const client = {
    environmentId: 'environment',
    application: async () => (created ? { applicationId: 'app', name: 'praetorium-pr-624' } : undefined),
    api: async (procedure: string) => {
      calls.push(procedure)
      if (procedure === 'application.create') created = true
      return procedure === 'application.one' ? { mounts } : {}
    },
  }
  return { client: client as unknown as DokployClient, calls }
}

it('mounts the shared catalogue cache before a new preview first starts', async () => {
  const { client, calls } = dokploy(false)
  await shareCatalogueCache(client, 'praetorium-pr-624')
  expect(calls).toEqual(['application.create', 'application.one', 'mounts.create'])
})

it('leaves an existing catalogue cache mount alone', async () => {
  const { client, calls } = dokploy(true, [{ volumeName: 'praetorium-preview-catalogues', mountPath: '/data' }])
  await shareCatalogueCache(client, 'praetorium-pr-624')
  expect(calls).toEqual(['application.one'])
})
