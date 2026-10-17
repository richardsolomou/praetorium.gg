import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { transformed } from '../shared/datacards'
import { TEXT_HASH_LENGTH, resolvedText, sourceStrings } from '../shared/sourceText'

/** Published text read back as a reader's browser reads it, from every JSON file under `root`. */
export function wordsFrom(root: string) {
  const strings = new Map<string, string>()
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.name.endsWith('.json'))
        for (const value of sourceStrings(JSON.parse(fs.readFileSync(file, 'utf8'))))
          strings.set(createHash('sha256').update(value).digest('hex').slice(0, TEXT_HASH_LENGTH), value)
    }
  }
  visit(root)
  return (text: string) =>
    resolvedText(
      text,
      ({ transform, hash }) => {
        const raw = strings.get(hash)
        return raw === undefined ? null : transformed(raw, transform)
      },
      () => '⟨missing⟩',
    )
}
