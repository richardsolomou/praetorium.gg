import path from 'node:path'
import { build } from 'vite'

/**
 * The repository files each of `entries` imports, directly or through other repository files,
 * relative to `root`. Packages are left out, so only the repository's own graph is resolved.
 */
export async function importClosures(root: string, entries: readonly string[]) {
  const imports = new Map<string, string[]>()
  const relative = (id: string) => path.relative(root, id.replace(/\?.*$/, ''))
  await build({
    configFile: false,
    envDir: false,
    logLevel: 'silent',
    mode: 'production',
    root,
    plugins: [
      {
        name: 'import-closures',
        moduleParsed(info) {
          if (!info.id.startsWith(root)) return
          const file = relative(info.id)
          const targets = [...info.importedIds, ...info.dynamicallyImportedIds].filter((id) => id.startsWith(root)).map(relative)
          imports.set(file, [...new Set([...(imports.get(file) ?? []), ...targets])])
        },
      },
    ],
    build: {
      ssr: true,
      write: false,
      minify: false,
      reportCompressedSize: false,
      rolldownOptions: {
        input: entries.map((entry) => path.join(root, entry)),
        // Only the import edges matter, not whether the bundle would link.
        shimMissingExports: true,
        // A bare specifier is a package; everything else resolves inside the repository.
        external: (id) => !/^[./\0]/.test(id) && !id.startsWith(root),
      },
    },
  })
  return new Map(
    entries.map((entry) => {
      const seen = new Set([entry])
      for (const file of seen) for (const target of imports.get(file) ?? []) if (!target.includes('node_modules')) seen.add(target)
      return [entry, [...seen].toSorted()]
    }),
  )
}
