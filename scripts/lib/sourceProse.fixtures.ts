import fs from 'node:fs'
import path from 'node:path'
import { sourceStrings } from '../../src/shared/sourceText'

/** Words as compared: markup and spacing never hide a sentence that came from a source file. */
export const normal = (text: string) =>
  text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_`#>^■]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

export const sentence = (words: string) =>
  words.length >= 60 && /[.!?]/.test(words) && words.split(' ').filter((word) => /^[a-z]/.test(word)).length >= 6

/** Every sentence the snapshot's files under these source directories hold, at the root and in every rules version. */
export function sourceProse(root: string, directories: readonly string[]) {
  const prose = new Set<string>()
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.name.endsWith('.json'))
        for (const value of sourceStrings(JSON.parse(fs.readFileSync(file, 'utf8'))))
          // A paragraph of a longer text is that source's sentence too, wherever another source prints it whole.
          for (const piece of [value, ...value.split('\n')]) {
            const words = normal(piece)
            if (sentence(words)) prose.add(words)
          }
    }
  }
  const editions = fs.existsSync(path.join(root, 'editions')) ? fs.readdirSync(path.join(root, 'editions')) : []
  for (const prefix of ['', ...editions.map((edition) => path.join('editions', edition))])
    for (const directory of directories) if (fs.existsSync(path.join(root, prefix, directory))) visit(path.join(root, prefix, directory))
  return prose
}

/**
 * Each string in a value, and each line of it, as an answer could leak a source sentence
 * through either. Attribution credits a source rather than quoting it, so it is not read.
 */
export function stringsIn(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') {
    found.push(value, ...value.split('\n'))
    try {
      if (value.startsWith('{') || value.startsWith('[')) stringsIn(JSON.parse(value), found)
    } catch {
      // Not JSON, so the string and its lines are all it holds.
    }
  } else if (Array.isArray(value)) for (const entry of value) stringsIn(entry, found)
  else if (value && typeof value === 'object')
    for (const [key, entry] of Object.entries(value)) if (key !== 'attribution') stringsIn(entry, found)
  return found
}

/** The names and titles an answer gives, which Praetorium publishes even where one reads like a sentence. */
export function namesIn(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('[')))
    try {
      namesIn(JSON.parse(value), found)
    } catch {
      // Not JSON, so it names nothing.
    }
  else if (Array.isArray(value)) for (const entry of value) namesIn(entry, found)
  else if (value && typeof value === 'object')
    for (const [key, entry] of Object.entries(value)) {
      if ((key === 'name' || key === 'title') && typeof entry === 'string') found.add(normal(entry))
      else namesIn(entry, found)
    }
  return found
}
