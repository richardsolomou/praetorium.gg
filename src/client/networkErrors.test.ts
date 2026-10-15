import { expect, it } from 'vitest'
import { isFetchNetworkFailure, isModuleLoadFailure } from './networkErrors'

it.each([
  new TypeError('Failed to fetch'),
  new TypeError('NetworkError when attempting to fetch resource.'),
  new TypeError('Load failed'),
  new TypeError('fetch failed'),
])('treats %s as a network failure', (error) => {
  expect(isFetchNetworkFailure(error)).toBe(true)
})

it.each([
  new Error('Failed to fetch'),
  new TypeError('Failed to fetch dynamically imported module: https://praetorium.gg/assets/a.js'),
  new TypeError('x is not a function'),
  'Failed to fetch',
  null,
])('reports %s as an application failure', (error) => {
  expect(isFetchNetworkFailure(error)).toBe(false)
})

it.each([
  new TypeError('Failed to fetch dynamically imported module: https://praetorium.gg/assets/a.js'),
  new TypeError('error loading dynamically imported module: https://praetorium.gg/assets/a.js'),
  new TypeError('Importing a module script failed.'),
])('treats %s as a failed chunk load', (error) => {
  expect(isModuleLoadFailure(error)).toBe(true)
})

it('does not treat a dropped fetch as a failed chunk load', () => {
  expect(isModuleLoadFailure(new TypeError('Failed to fetch'))).toBe(false)
})
