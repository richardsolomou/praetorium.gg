import { expect, it } from 'vitest'
import { spacetimePublicUri } from './spacetimePublicUri'

it('keeps the browser on the public HTTPS app origin', () => {
  expect(spacetimePublicUri('https://praetorium.gg')).toBe('https://praetorium.gg/spacetime/')
})

it('supports the local HTTP app origin', () => {
  expect(spacetimePublicUri('http://127.0.0.1:4173')).toBe('http://127.0.0.1:4173/spacetime/')
})

it('rejects an app URL with a path', () => {
  expect(() => spacetimePublicUri('https://praetorium.gg/other')).toThrow('Invalid APP_URL')
})
