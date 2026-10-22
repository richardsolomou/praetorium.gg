export function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
}

export const PROBLEMS = 'Common problems'

/** A heading of a doc; `problem` marks a symptom listed under Common problems. */
export type Heading = { depth: 2 | 3; text: string; id: string; problem: boolean }

/** The `##` and `###` headings of a doc, outside code blocks, in reading order. */
export function headings(markdown: string): Heading[] {
  let fenced = false
  let section = ''
  const found: Heading[] = []
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced
    const match = !fenced && /^(##|###) (.+)$/.exec(line)
    if (!match) continue
    const text = match[2]!.replace(/[*`]/g, '')
    const depth = match[1] === '##' ? 2 : 3
    if (depth === 2) section = text
    found.push({ depth, text, id: slug(text), problem: depth === 3 && section === PROBLEMS })
  }
  return found
}
