import { describe, expect, it } from 'vitest'
import { favouriteDetachmentKey } from '../core/favouriteDetachments'
import { favouriteDetachmentsFirst } from './favouriteDetachments'

describe('favouriteDetachmentsFirst', () => {
  it('moves the current faction’s favourites ahead, each part in alphabetical order', () => {
    const detachments = [
      { id: 'warhost', name: 'Warhost' },
      { id: 'ghosts', name: 'ghosts of the Ancients' },
      { id: 'aspect', name: 'Aspect Host' },
      { id: 'eldritch', name: 'Éldritch Raiders' },
    ]
    const favourites = new Set([favouriteDetachmentKey('aeldari', 'warhost'), favouriteDetachmentKey('other', 'aspect')])

    expect(favouriteDetachmentsFirst(detachments, 'aeldari', favourites).map((detachment) => detachment.id)).toEqual([
      'warhost',
      'aspect',
      'eldritch',
      'ghosts',
    ])
  })
})
