import { expect, it } from 'vitest'
import { deviceEngineFile } from './deviceEngine'

const map = JSON.stringify({
  imports: {
    '/assets/construction-Czga1No9.js': '/assets/construction-BpTsM4QI.js',
    '/assets/construction.worker-BrleHzDV.js': '/assets/construction.worker-Bg4y0yb0.js',
  },
})

it('names the file a build serves the device engine from', () => {
  expect(deviceEngineFile(map)).toBe('/assets/construction.worker-Bg4y0yb0.js')
})

it('names no file for a build without an import map', () => {
  expect(deviceEngineFile(undefined)).toBeNull()
})
