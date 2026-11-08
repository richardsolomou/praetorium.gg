import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { reportServerFailure } from '../adapters/posthog'
import { recordServerStart } from './serverStartRecord'

vi.mock('../adapters/posthog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../adapters/posthog')>()),
  reportServerFailure: vi.fn(),
}))

let directory: string
const start = (revision: string) => recordServerStart({ APP_URL: 'https://praetorium.gg', GITHUB_SHA: revision, DATA_DIR: directory })

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'server-start-'))
  vi.mocked(reportServerFailure).mockClear()
})

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true })
})

test('reports a start on the revision the previous start ran', () => {
  start('release-a')
  start('release-a')
  expect(vi.mocked(reportServerFailure).mock.calls).toEqual([[{ event: 'server_restarted_same_revision', revision: 'release-a' }]])
})

test('stays silent through a deploy and its rollback', () => {
  start('release-a')
  start('release-b')
  start('release-a')
  expect(reportServerFailure).not.toHaveBeenCalled()
})

test('starts normally when the record cannot be read', () => {
  fs.mkdirSync(path.join(directory, 'last-start-revision'))
  expect(() => start('release-a')).not.toThrow()
})
