import { expect, it } from 'vitest'
import { spacetimeBrowserUri } from './spacetimeBrowserUri'

it('uses the browser origin for the local SpacetimeDB proxy', () => {
  expect(spacetimeBrowserUri('http://127.0.0.1:3000/spacetime/', 'http://localhost:3000')).toBe('http://localhost:3000/spacetime/')
})

it('keeps the hosted proxy on its existing origin', () => {
  expect(spacetimeBrowserUri('https://praetorium.gg/spacetime/', 'https://praetorium.gg')).toBe('https://praetorium.gg/spacetime/')
})
