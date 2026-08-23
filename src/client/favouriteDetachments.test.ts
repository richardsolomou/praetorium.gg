import { describe, expect, it } from 'vitest'
import { favouriteDetachmentKey, favouriteDetachmentsFirst } from './favouriteDetachments'

describe('favouriteDetachmentsFirst', () => {
  it('moves the current faction’s favourites ahead without changing their order', () => {
    const detachments = [{ id: 'first' }, { id: 'second' }, { id: 'third' }]
    const favourites = new Set([favouriteDetachmentKey('aeldari', 'second'), favouriteDetachmentKey('other', 'first')])

    expect(favouriteDetachmentsFirst(detachments, 'aeldari', favourites).map((detachment) => detachment.id)).toEqual([
      'second',
      'first',
      'third',
    ])
  })
})
