import { expect, it } from 'vitest'
import { importClosures } from '../../scripts/lib/moduleGraph'

// The plugin bundles separately from the SSR bundle that serves requests; any of these in its graph is a second copy
// of the request-path caches, and warming that copy leaves requests cold.
const requestPath = new Set([
  'src/server/app.ts',
  'src/shared/cataloguePicker.ts',
  'src/shared/pickerUnits.ts',
  'src/server/referenceCatalogue.ts',
])

it('keeps the request-path caches out of the warm plugin bundle', async () => {
  const closure = (await importClosures(process.cwd(), ['src/server/warmPlugin.ts'])).get('src/server/warmPlugin.ts')!
  expect(closure.filter((file) => requestPath.has(file))).toEqual([])
}, 60_000)
