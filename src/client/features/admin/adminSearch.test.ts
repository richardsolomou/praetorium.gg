import { describe, expect, it } from 'vitest'
import { readAdminSearch } from './adminSearch'

describe('readAdminSearch', () => {
  it('keeps a bookmarked tab, search, filter, order and page', () => {
    expect(readAdminSearch({ tab: 'players', q: 'kieran', role: 'admin', sort: 'seen', order: 'asc', page: 3, size: 50 })).toEqual({
      tab: 'players',
      q: 'kieran',
      role: 'admin',
      sort: 'seen',
      order: 'asc',
      page: 3,
      size: 50,
    })
  })

  it('reads a numeric search as text', () => {
    expect(readAdminSearch({ q: 42 })).toEqual({ q: '42' })
  })

  it('lists roles once, in a fixed order, ignoring unknown ones', () => {
    expect(readAdminSearch({ role: 'user,owner,admin,user' })).toEqual({ role: 'admin,user' })
  })

  it('leaves defaults out of the address', () => {
    expect(readAdminSearch({ sort: 'joined', page: 1, size: 25, order: 'desc' })).toEqual({})
  })

  it('drops values the table cannot show', () => {
    expect(readAdminSearch({ tab: 'secrets', sort: 'password', page: 2.5, size: 1_000 })).toEqual({})
  })
})
