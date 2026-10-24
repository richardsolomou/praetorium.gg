/** A changed region of a diff: its base-side lines, and the lines it removed and added. */
export type Hunk = { start: number; end: number; removed: string[]; added: string[]; addedStart: number }

type Declaration =
  | { kind: 'type'; start: number; end: number }
  | { kind: 'import'; start: number; end: number; sideEffect: boolean; bindings: Map<string, string> }

const comment = (line: string) => /^\s*(\/\/|\/\*|\*|$)/.test(line)

/**
 * Bindings a top-level import or re-export declares, by local name, with the module each comes from.
 * Type-only bindings are left out: they leave nothing at runtime.
 */
function importBindings(statement: string): { sideEffect: boolean; bindings: Map<string, string> } {
  const source = /['"]([^'"]+)['"]\s*;?\s*$/.exec(statement)?.[1] ?? ''
  const bindings = new Map<string, string>()
  if (/^(import|export)\s+type\b/.test(statement)) return { sideEffect: false, bindings }
  if (/^import\s+['"]/.test(statement)) return { sideEffect: true, bindings }
  const defaultName = /^import\s+([A-Za-z_$][\w$]*)\s*(,|from\b)/.exec(statement)?.[1]
  if (defaultName) bindings.set(defaultName, source)
  const namespace = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(statement)?.[1]
  if (namespace) bindings.set(namespace, source)
  if (/^export\s+\*\s+from\b/.test(statement)) bindings.set('*', source)
  for (const member of /\{([^}]*)\}/.exec(statement)?.[1]?.split(',') ?? []) {
    const name = member.trim()
    if (!name || /^type\s/.test(name)) continue
    bindings.set(name.split(/\s+as\s+/).at(-1)!, source)
  }
  return { sideEffect: false, bindings }
}

/** The 1-based line spans of a module's top-level imports, re-exports and type declarations. */
export function declarations(text: string): Declaration[] {
  const lines = text.split('\n')
  const found: Declaration[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    // `import.meta` and `import()` are expressions, not declarations.
    if (/^import\b(?!\s*[.(])/.test(line) || /^export\s+(type\s+)?(\*|\{)/.test(line)) {
      let end = index
      // Statements end on their module specifier; a local `export { a }` has none and is no import.
      while (end < lines.length - 1 && !/['"][^'"]+['"]\s*;?\s*$/.test(lines[end]!)) end += 1
      const statement = lines.slice(index, end + 1).join(' ')
      if (/['"][^'"]+['"]\s*;?\s*$/.test(statement) && (/^import\b/.test(statement) || /\bfrom\s*['"]/.test(statement)))
        found.push({ kind: 'import', start: index + 1, end: end + 1, ...importBindings(statement) })
      index = end
    } else if (/^(export\s+)?(declare\s+)?(type|interface)\s+[A-Za-z_$]/.test(line)) {
      let depth = 0
      let end = index
      for (; end < lines.length; end += 1) {
        for (const character of lines[end]!) depth += '{[('.includes(character) ? 1 : ')]}'.includes(character) ? -1 : 0
        const next = lines[end + 1]
        // A declaration ends where its brackets close and the next line does not continue it.
        if (depth <= 0 && (next === undefined || !/^\s+\S|^\s*[|&]/.test(next) || next.trim() === '')) break
      }
      found.push({ kind: 'type', start: index + 1, end: end + 1 })
      index = end
    }
  }
  return found
}

/**
 * Whether an edit cannot change what runs: it only touches comments, type declarations, or imports
 * that add or drop bindings from modules the file already imports. Code that uses a new binding is
 * itself an edit, so it is still counted. Moving a binding to another module, importing from a
 * module the file did not import before or no longer does, or adding or removing an import that
 * only runs a module for its side effects, does change what runs and is not quiet.
 */
export function quietHunk(hunk: Hunk, base: string | null, head: string | null) {
  if ([...hunk.removed, ...hunk.added].every(comment)) return true
  if (base === null || head === null) return false
  const touched = (text: string, start: number, lines: readonly string[]) => {
    const found = declarations(text)
    return lines.flatMap((line, index) => {
      if (comment(line)) return []
      const declaration = found.find(({ start: first, end }) => first <= start + index && start + index <= end)
      return [declaration ?? null]
    })
  }
  const before = touched(base, hunk.start, hunk.removed)
  const after = touched(head, hunk.addedStart, hunk.added)
  if ([...before, ...after].some((declaration) => declaration === null)) return false
  const sources = new Map<string, string>()
  for (const declaration of new Set(before))
    if (declaration?.kind === 'import') {
      if (declaration.sideEffect) return false
      for (const [name, source] of declaration.bindings) sources.set(name, source)
    }
  // Starting or stopping imports from a module starts or stops running its top level.
  const importedFrom = (text: string) =>
    new Set(declarations(text).flatMap((declaration) => (declaration.kind === 'import' ? [...declaration.bindings.values()] : [])))
  const imported = importedFrom(base)
  const stillImported = importedFrom(head)
  for (const declaration of new Set(before))
    if (declaration?.kind === 'import' && [...declaration.bindings.values()].some((source) => !stillImported.has(source))) return false
  for (const declaration of new Set(after))
    if (declaration?.kind === 'import') {
      if (declaration.sideEffect) return false
      for (const [name, source] of declaration.bindings)
        if ((sources.has(name) && sources.get(name) !== source) || !imported.has(source)) return false
    }
  return true
}
