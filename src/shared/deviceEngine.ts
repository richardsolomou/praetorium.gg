/**
 * The hashed file a build serves the device engine's worker from, by its import map. The worker inlines everything it
 * runs, so the file changes exactly when the engine's code does.
 */
export function deviceEngineFile(importMap: string | undefined): string | null {
  if (!importMap) return null
  const imports: Record<string, string> = JSON.parse(importMap).imports ?? {}
  return Object.entries(imports).find(([name]) => /\/construction\.worker-[^/]+\.js$/.test(name))?.[1] ?? null
}
