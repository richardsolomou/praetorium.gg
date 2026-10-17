import { afterEach, expect, it, vi } from 'vitest'
import { writeWorkspaceState } from './workspaceState'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('keeps editing when the browser refuses workspace memory', () => {
  vi.stubGlobal('sessionStorage', {
    setItem: () => {
      throw new Error('full')
    },
  })
  expect(() => writeWorkspaceState('/rosters/army-id', 'roster-setup', { name: 'Army' })).not.toThrow()
})
