import type { DokployClient } from 'ras-stack/preview/dokploy'
import { expect, it } from 'vitest'
import { makeRoomForPreview, prepareApplication, previewDatabase, previewImageRevision } from './dokployPreview'

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

const cacheMount = { volumeName: 'praetorium-preview-catalogues', mountPath: '/data' }
const twoGibibytes = String(2 * 1024 ** 3)

function dokploy(existing: boolean, settings: { mounts?: (typeof cacheMount)[]; memoryLimit?: string | null } = {}) {
  const calls: string[] = []
  let created = existing
  const client = {
    environmentId: 'environment',
    application: async () => (created ? { applicationId: 'app', name: 'praetorium-pr-624' } : undefined),
    api: async (procedure: string) => {
      calls.push(procedure)
      if (procedure === 'application.create') created = true
      return procedure === 'application.one' ? settings : {}
    },
  }
  return { client: client as unknown as DokployClient, calls }
}

it('caps memory and mounts the shared catalogue cache before a new preview first starts', async () => {
  const { client, calls } = dokploy(false)
  await prepareApplication(client, 'praetorium-pr-624')
  expect(calls).toEqual(['application.create', 'application.one', 'application.update', 'mounts.create'])
})

it('caps the memory of an existing preview that has none', async () => {
  const { client, calls } = dokploy(true, { mounts: [cacheMount], memoryLimit: null })
  await prepareApplication(client, 'praetorium-pr-624')
  expect(calls).toEqual(['application.one', 'application.update'])
})

it('leaves a prepared preview alone', async () => {
  const { client, calls } = dokploy(true, { mounts: [cacheMount], memoryLimit: twoGibibytes })
  await prepareApplication(client, 'praetorium-pr-624')
  expect(calls).toEqual(['application.one'])
})

function previews(applications: { name: string; createdAt: string; applicationStatus: string }[]) {
  const stopped: string[] = []
  const client = {
    applications: async () => applications.map((application) => ({ ...application, applicationId: application.name })),
    api: async (procedure: string, { body }: { body: { applicationId: string } }) => {
      if (procedure === 'application.stop') stopped.push(body.applicationId)
      return {}
    },
  }
  return { client: client as unknown as DokployClient, stopped }
}

it('stops the longest-standing running previews so the deploying one is the third', async () => {
  const { client, stopped } = previews([
    { name: 'praetorium-pr-3', createdAt: '2026-11-03T00:00:00Z', applicationStatus: 'done' },
    { name: 'praetorium-pr-1', createdAt: '2026-11-01T00:00:00Z', applicationStatus: 'done' },
    { name: 'praetorium-pr-2', createdAt: '2026-11-02T00:00:00Z', applicationStatus: 'idle' },
    { name: 'praetorium-pr-4', createdAt: '2026-11-04T00:00:00Z', applicationStatus: 'running' },
    { name: 'praetorium-pr-5', createdAt: '2026-11-05T00:00:00Z', applicationStatus: 'done' },
    { name: 'praetoriumgg-web', createdAt: '2026-10-01T00:00:00Z', applicationStatus: 'done' },
  ])
  await makeRoomForPreview(client, 'praetorium', 'praetorium-pr-5')
  expect(stopped).toEqual(['praetorium-pr-1'])
})
