import { expect, it, vi } from 'vitest'
import { markReleaseSeen, subscribeSeenRelease, unseenChanges } from './seenRelease'

const notes = [
  { version: '0.134.0', changes: ['Newest'] },
  { version: '0.133.1', changes: ['Middle'] },
  { version: '0.133.0', changes: ['Already seen'] },
]

it('lists the changes released after the acknowledged version, newest first', () => {
  expect(unseenChanges(notes, '0.133.0', '0.134.0')).toEqual(['Newest', 'Middle'])
})

it('lists nothing when the acknowledged version is current', () => {
  expect(unseenChanges(notes, '0.134.0', '0.134.0')).toEqual([])
})

it('leaves out releases newer than the running app', () => {
  expect(unseenChanges(notes, '0.133.0', '0.133.1')).toEqual(['Middle'])
})

const listen = () => {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('localStorage', { setItem: () => undefined })
  const changed = vi.fn()
  subscribeSeenRelease(changed)
  return changed
}

it('tells this window when it acknowledges a release', () => {
  const changed = listen()
  markReleaseSeen('0.134.0')
  expect(changed).toHaveBeenCalledOnce()
})

it('tells this window when another window acknowledges a release', () => {
  const changed = listen()
  window.dispatchEvent(Object.assign(new Event('storage'), { key: 'praetorium-seen-release' }))
  expect(changed).toHaveBeenCalledOnce()
})

it('ignores other stored settings changing in another window', () => {
  const changed = listen()
  window.dispatchEvent(Object.assign(new Event('storage'), { key: 'praetorium-text-size' }))
  expect(changed).not.toHaveBeenCalled()
})
