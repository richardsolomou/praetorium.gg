import { expect, it } from 'vitest'
import { predatesEventHosts } from './savedSealedEvents'

it('drops an event saved before it named its host', () => {
  expect(predatesEventHosts({ name: 'Autumn tournament', admins: [] })).toBe(true)
})

it('keeps an event that names its host', () => {
  expect(predatesEventHosts({ kind: 'club', tournament: null })).toBe(false)
})

it('keeps a saved answer that there is no such event', () => {
  expect(predatesEventHosts(null)).toBe(false)
})
