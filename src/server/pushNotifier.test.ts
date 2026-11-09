import { expect, it } from 'vitest'
import { campaignPath } from './pushNotifier'

it('tags a notification page that already has a query with its notice kind', () => {
  expect(campaignPath('/tournaments/t?event=e', 'sealed-event-round-paired')).toBe(
    '/tournaments/t?event=e&utm_source=praetorium-app&utm_medium=push&utm_campaign=sealed-event-round-paired',
  )
})
