import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

let stored: Map<string, string>
let dataset: Record<string, string>

let TEXT_SIZE_SCRIPT: string
let chooseTextSize: typeof import('./textSize').chooseTextSize
let followTextSize: typeof import('./textSize').followTextSize
let savedTextSize: typeof import('./textSize').savedTextSize

beforeEach(async () => {
  // Writes this page made outlive a test in the stored-value module, so each test starts from a fresh page.
  vi.resetModules()
  ;({ TEXT_SIZE_SCRIPT, chooseTextSize, followTextSize, savedTextSize } = await import('./textSize'))
  stored = new Map()
  dataset = {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  })
  vi.stubGlobal('document', { documentElement: { dataset } })
  vi.stubGlobal('window', new EventTarget())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const runHeadScript = () => runInNewContext(TEXT_SIZE_SCRIPT, { localStorage: globalThis.localStorage, document: globalThis.document })

it('applies a saved size before the page renders', () => {
  stored.set('praetorium-text-size', 'larger')
  runHeadScript()
  expect(dataset.textSize).toBe('larger')
})

it('ignores a saved value that is not a size', () => {
  stored.set('praetorium-text-size', '30px')
  runHeadScript()
  expect(dataset.textSize).toBeUndefined()
})

it('keeps the standard size when nothing is saved', () => {
  runHeadScript()
  expect(dataset.textSize).toBeUndefined()
})

it('keeps the standard size when storage refuses to be read', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('denied')
    },
  })
  runHeadScript()
  expect(savedTextSize()).toBe('standard')
})

it('remembers a chosen size and applies it at once', () => {
  chooseTextSize('large')
  expect({ saved: savedTextSize(), applied: dataset.textSize }).toEqual({ saved: 'large', applied: 'large' })
})

it('forgets the choice when the standard size is chosen again', () => {
  chooseTextSize('larger')
  chooseTextSize('standard')
  expect({ stored: stored.size, applied: dataset.textSize }).toEqual({ stored: 0, applied: undefined })
})

it('restores the saved size in a document the head script never ran in', () => {
  stored.set('praetorium-text-size', 'large')
  followTextSize()
  expect(dataset.textSize).toBe('large')
})

it('applies a size another tab chose', () => {
  followTextSize()
  stored.set('praetorium-text-size', 'larger')
  window.dispatchEvent(Object.assign(new Event('storage'), { key: 'praetorium-text-size' }))
  expect(dataset.textSize).toBe('larger')
})
