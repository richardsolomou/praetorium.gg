import { describe, expect, it } from 'vitest'
import { StreamLimiter } from './connections'

describe('StreamLimiter', () => {
  it('turns away one account that opens too many', () => {
    const limiter = new StreamLimiter(10, 2)
    limiter.enter('alex')
    limiter.enter('alex')
    expect(limiter.enter('alex')).toBeUndefined()
  })

  it('lets someone back in after they release', () => {
    const limiter = new StreamLimiter(10, 1)
    const release = limiter.enter('alex')
    release?.()
    expect(limiter.enter('alex')).toBeDefined()
  })

  it('counts a release once, however many times it is called', () => {
    const limiter = new StreamLimiter(1, 1)
    const release = limiter.enter('alex')
    release?.()
    release?.()
    limiter.enter('nick')
    expect(limiter.enter('sam')).toBeUndefined()
  })

  it('turns away a new account once the whole server is full', () => {
    const limiter = new StreamLimiter(1, 1)
    limiter.enter('alex')
    expect(limiter.enter('nick')).toBeUndefined()
  })
})
