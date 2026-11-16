import { expect, it } from 'vitest'
import { deploymentHost, serverEventContext } from './posthog'

const event = (properties?: Record<string, unknown>) => ({ distinctId: 'player', event: 'roster_created', properties })

it.each([
  ['https://praetorium.gg', 'praetorium.gg'],
  ['https://pr-722.praetorium.gg/', 'pr-722.praetorium.gg'],
  ['http://127.0.0.1:4173', '127.0.0.1:4173'],
])('names the deployment at %s by its host', (url, host) => {
  expect(deploymentHost(url)).toBe(host)
})

it.each([undefined, '', 'not a url'])('names no deployment for %j', (url) => {
  expect(deploymentHost(url)).toBeUndefined()
})

it('labels a server event with the deployment host', () => {
  expect(serverEventContext('pr-722.praetorium.gg')(event({ outcome: 'appended' }))?.properties).toEqual({
    outcome: 'appended',
    $host: 'pr-722.praetorium.gg',
  })
})

it('labels a server event that has no properties', () => {
  expect(serverEventContext('praetorium.gg')(event())?.properties).toEqual({ $host: 'praetorium.gg' })
})

it('leaves an event unlabelled when the deployment is unknown', () => {
  expect(serverEventContext(undefined)(event({ outcome: 'appended' }))?.properties).toEqual({ outcome: 'appended' })
})
