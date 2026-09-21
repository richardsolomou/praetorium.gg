import { describe, expect, it } from 'vitest'
import { isExpectedRealtimeDisconnect } from './realtimeErrors'

describe('isExpectedRealtimeDisconnect', () => {
  it('treats a closed connection as expected', () => {
    expect(isExpectedRealtimeDisconnect({ code: 11, message: 'connection closed' })).toBe(true)
  })

  it('treats a lost seat as expected', () => {
    const error = Object.assign(new Error(''), { name: 'UnauthorizedError' })
    expect(isExpectedRealtimeDisconnect(error)).toBe(true)
  })

  it('treats a fetch network failure as expected across engines', () => {
    expect(isExpectedRealtimeDisconnect(new TypeError('Failed to fetch'))).toBe(true)
    expect(isExpectedRealtimeDisconnect(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(isExpectedRealtimeDisconnect(new TypeError('Load failed'))).toBe(true)
    expect(isExpectedRealtimeDisconnect(new TypeError('fetch failed'))).toBe(true)
  })

  it('reports a genuine failure', () => {
    expect(isExpectedRealtimeDisconnect(new Error('something broke'))).toBe(false)
    expect(isExpectedRealtimeDisconnect({ code: 1, message: 'internal error' })).toBe(false)
  })

  it('reports a genuine type error that is not a fetch failure', () => {
    expect(isExpectedRealtimeDisconnect(new TypeError('x is not a function'))).toBe(false)
  })

  it('reports a non-object rejection', () => {
    expect(isExpectedRealtimeDisconnect('connection closed')).toBe(false)
    expect(isExpectedRealtimeDisconnect(null)).toBe(false)
  })
})
