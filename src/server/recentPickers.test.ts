import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { recentPickers } from './recentPickers'

let file: string

beforeEach(() => {
  vi.useFakeTimers()
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pickers-')), 'recent-pickers.json')
})
afterEach(() => vi.useRealTimers())

it('hands the pickers opened, newest first and each once, to the next process', () => {
  const store = recentPickers(file)
  store.record({ catalogueId: 'necrons', battleSize: 1000, detachmentIds: [] })
  store.record({ catalogueId: 'orks', battleSize: 2000, detachmentIds: ['waaagh'] })
  store.record({ catalogueId: 'necrons', battleSize: 1000, waivedRules: [] })
  vi.runAllTimers()
  const next = recentPickers(file)
  next.record({ catalogueId: 'orks', battleSize: 2000, detachmentIds: ['waaagh'] })
  expect(next.list()).toEqual([
    { catalogueId: 'orks', battleSize: 2000, detachmentIds: ['waaagh'] },
    { catalogueId: 'necrons', battleSize: 1000 },
  ])
})
