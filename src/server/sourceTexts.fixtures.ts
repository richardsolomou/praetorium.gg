import fs from 'node:fs'
import path from 'node:path'
import { transformed } from '../shared/datacards'
import { resolvedText } from '../shared/sourceText'
import { stringsByHash } from './sourceTexts'

/** Published text read back as a reader's browser reads it, from a JSON file or every JSON file under a directory. */
export function wordsFrom(source: string) {
  const strings = new Map<string, string>()
  const read = (file: string) => {
    for (const [key, value] of stringsByHash(file)) strings.set(key, value)
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
