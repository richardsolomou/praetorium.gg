import { afterEach, beforeEach, expect, it, vi } from 'vitest'

class MemoryStorage {
  values = new Map<string, string>()
  refuse = false
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (this.refuse) throw new Error('QuotaExceededError')
    this.values.set(key, value)
  }
  removeItem(key: string) {
    if (this.refuse) throw new Error('SecurityError')
    this.values.delete(key)
  }
}

let storage: MemoryStorage

beforeEach(() => {
  vi.resetModules()
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', new EventTarget())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('reads back a value that browser storage refused for the rest of the page', async () => {
  const { readStoredValue, writeStoredValue } = await import('./storedValue')
  storage.refuse = true
  writeStoredValue('key', 'kept here')
  expect(readStoredValue('key')).toBe('kept here')
})

it('reports a write that browser storage refused', async () => {
  const { writeStoredValue } = await import('./storedValue')
  storage.refuse = true
  expect(writeStoredValue('key', 'value')).toBe(false)
})

it('removes an entry written as null', async () => {
  const { readStoredValue, writeStoredValue } = await import('./storedValue')
  writeStoredValue('key', 'value')
  writeStoredValue('key', null)
  expect({ read: readStoredValue('key'), stored: storage.getItem('key') }).toEqual({ read: null, stored: null })
})
