import { expect, it } from 'vitest'
import { importClosures } from '../../scripts/lib/moduleGraph'

// The plugin bundles separately from the SSR bundle that serves requests, so any module it imports is a second copy
// whose module-level state requests never read. The pool shares its state through `globalSingleton`; review any new
// entry for module-level caches before adding it.
it('imports only modules whose state the plugin bundle may hold', async () => {
  const closure = (await importClosures(process.cwd(), ['src/server/warmPlugin.ts'])).get('src/server/warmPlugin.ts')
  expect(closure).toEqual([
    'src/server/combatCalculationPool.ts',
    'src/server/warmPlugin.ts',
    'src/shared/boundedCache.ts',
    'src/shared/combatAnswerCache.ts',
  ])
}, 60_000)
