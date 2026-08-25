import { describe, expect, it } from 'vitest'
import { isSignedOut, SIGN_IN_REQUIRED } from './session'

describe('isSignedOut', () => {
  it('recognises the refusal a server function throws', () => {
    expect(isSignedOut(new Response(SIGN_IN_REQUIRED, { status: 401 }))).toBe(true)
  })

  it('recognises the same refusal once it has crossed the wire', () => {
    expect(isSignedOut(new Error(SIGN_IN_REQUIRED))).toBe(true)
  })

  it('leaves another refusal alone', () => {
    expect(isSignedOut(new Response('admin access required', { status: 403 }))).toBe(false)
    expect(isSignedOut(new Error('admin access required'))).toBe(false)
    expect(isSignedOut(new Error('you are not in this battle'))).toBe(false)
  })

  it('leaves a genuine failure alone', () => {
    expect(isSignedOut(new Error('something broke'))).toBe(false)
    expect(isSignedOut(new Error(''))).toBe(false)
  })

  it('leaves a non-object rejection alone', () => {
    expect(isSignedOut(SIGN_IN_REQUIRED)).toBe(false)
    expect(isSignedOut(null)).toBe(false)
    expect(isSignedOut(undefined)).toBe(false)
  })
})
