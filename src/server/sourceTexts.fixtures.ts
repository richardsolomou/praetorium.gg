import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { transformed } from '../shared/datacards'
import { TEXT_HASH_LENGTH, resolvedText, sourceStrings } from '../shared/sourceText'

/** Published text read back as a reader's browser reads it, from a JSON file or every JSON file under a directory. */
export function wordsFrom(source: string) {
  const strings = new Map<string, string>()
  const read = (file: string) => {
    for (const value of sourceStrings(JSON.parse(fs.readFileSync(file, 'utf8'))))
      strings.set(hash('sha256', value).slice(0, TEXT_HASH_LENGTH), value)
  }
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.name.endsWith('.json')) read(file)
    }
  }
  if (fs.statSync(source).isDirectory()) visit(source)
  else read(source)
  return (text: string) =>
    resolvedText(
      text,
      ({ transform, hash: key }) => {
        const raw = strings.get(key)
        return raw === undefined ? null : transformed(raw, transform)
      },
      () => '⟨missing⟩',
    )
}
