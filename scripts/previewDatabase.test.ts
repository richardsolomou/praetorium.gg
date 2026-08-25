import postgres from 'postgres'
import { beforeEach, expect, it, vi } from 'vitest'
import { resetPreviewDatabase } from './previewDatabase'

vi.mock('postgres', () => ({ default: vi.fn() }))

const ADMIN = 'postgres://preview:secret@preview-postgres:5432/postgres'
const TARGET = 'postgres://preview:secret@preview-postgres:5432/praetorium_pr_165'
const unsafe = vi.fn(async (_query: string) => [])
const end = vi.fn(async () => undefined)
const admin = Object.assign(
  vi.fn(async () => [{ datname: 'praetorium_pr_12' }]),
  { unsafe, end },
)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(postgres).mockReturnValue(admin as never)
})

it('resets only its target when a legacy caller supplies peer preview numbers', async () => {
  await Reflect.apply(resetPreviewDatabase, undefined, [ADMIN, TARGET, ['12', '165']])

  expect(unsafe.mock.calls.map(([query]) => query)).toEqual([
    'drop database if exists "praetorium_pr_165" with (force)',
    'create database "praetorium_pr_165"',
  ])
})
