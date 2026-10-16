import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('merging classes in a dark-only app', () => {
  it('lets a caller border replace a dark default', () => {
    expect(cn('border-border dark:border-input', 'border-parchment')).toBe('border-parchment')
  })

  it('keeps a dark default over the base class it replaces', () => {
    expect(cn('bg-transparent dark:bg-input/30')).toBe('dark:bg-input/30')
  })

  it('lets a caller hover replace a dark hover default', () => {
    expect(cn('hover:bg-muted dark:hover:bg-input/50', 'hover:bg-raised')).toBe('hover:bg-raised')
  })
})
