import { describe, expect, it } from 'vitest'
import { fromBase64Url, toBase64, toBase64Url } from './base64'

const bytes = (...values: number[]) => new Uint8Array(values)

describe('base64', () => {
  it('keeps padding in plain base64', () => {
    expect(toBase64(bytes(0xfb, 0xff))).toBe('+/8=')
  })

  it('makes URL-safe base64 without padding', () => {
    expect(toBase64Url(bytes(0xfb, 0xff))).toBe('-_8')
  })

  it('reads unpadded URL-safe base64', () => {
    expect([...fromBase64Url('-_8')]).toEqual([0xfb, 0xff])
  })

  it('encodes more bytes than one call can spread', () => {
    const large = Uint8Array.from({ length: 200_000 }, (_, index) => (index * 7) % 256)
    expect(toBase64Url(large)).toBe(Buffer.from(large).toString('base64url'))
  })

  it('refuses text that is not base64', () => {
    expect(() => fromBase64Url('a')).toThrow()
  })
})
