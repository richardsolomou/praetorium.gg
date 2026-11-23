/** A run of summary text: bold, or naming another VS Data record as `kind:id`. */
export type SummaryInline = { text: string; bold?: true; target?: { kind: string; id: string } }
export type SummaryBlock = { paragraph: SummaryInline[] } | { list: 'ordered' | 'unordered'; items: SummaryInline[][] }

const UNORDERED = /^- (.*)$/
const ORDERED = /^\d+\. (.*)$/
// Link text may hold one level of balanced brackets, as CommonMark allows, so `[[LETHAL HITS]](vsdata:…)` links `[LETHAL HITS]`.
const LINK = /\[((?:[^[\]\n]|\[[^[\]\n]*\])+)\]\(vsdata:([a-z0-9-]+)\/([^\s)]+)\)/g

/**
 * A summary in VS Data's restricted Markdown: paragraphs split by a blank line, a block whose every line starts "- " or
 * "1. " as a list (no nesting), `**bold**`, and `[text](vsdata:<kind>/<id>)` links. Anything else, HTML, an image, a
 * link elsewhere or an unclosed marker, reads as the plain text it is.
 */
export function summaryBlocks(markdown: string): SummaryBlock[] {
  return markdown
    .replaceAll('\r\n', '\n')
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block): SummaryBlock => {
      const lines = block.split('\n').map((line) => line.trim())
      for (const [list, marker] of [
        ['unordered', UNORDERED],
        ['ordered', ORDERED],
      ] as const)
        if (lines.every((line) => marker.test(line))) return { list, items: lines.map((line) => inlines(marker.exec(line)![1]!)) }
      return { paragraph: inlines(lines.join(' ')) }
    })
}

/** The words a summary says, without its markup: what is compared with a source's wording. */
export function summaryText(markdown: string) {
  return summaryBlocks(markdown)
    .map((block) => ('paragraph' in block ? [block.paragraph] : block.items).map((runs) => runs.map((run) => run.text).join('')).join('\n'))
    .join('\n\n')
}

/** A paragraph of a summary written as plain text with offset spans, the form VS Data used before its Markdown. */
export function spannedParagraph(
  text: string,
  spans: readonly { start: number; end: number; bold?: boolean; target?: { kind: string; id: string } }[],
): SummaryBlock {
  const runs: SummaryInline[] = []
  let read = 0
  // A span out of range, empty, or overlapping the one before it is left out rather than misplacing the text around it.
  for (const given of spans.toSorted((left, right) => left.start - right.start)) {
    // A link to an ability printed in brackets, as `[LANCE]`, takes its brackets, as a Markdown link's text does.
    const bracketed = given.target && text[given.start - 1] === '[' && text[given.end] === ']'
    const span = bracketed ? { ...given, start: given.start - 1, end: given.end + 1 } : given
    if (span.start < read || span.end <= span.start || span.end > text.length) continue
    if (span.start > read) runs.push({ text: text.slice(read, span.start) })
    runs.push({
      text: text.slice(span.start, span.end),
      ...(span.bold ? { bold: true as const } : {}),
      ...(span.target ? { target: span.target } : {}),
    })
    read = span.end
  }
  if (read < text.length) runs.push({ text: text.slice(read) })
  return { paragraph: runs }
}

function inlines(text: string): SummaryInline[] {
  const runs: SummaryInline[] = []
  let read = 0
  for (const match of text.matchAll(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g)) {
    runs.push(...links(text.slice(read, match.index)))
    runs.push(...links(match[1]!).map((run) => ({ ...run, bold: true as const })))
    read = match.index + match[0].length
  }
  runs.push(...links(text.slice(read)))
  return runs.filter((run) => run.text)
}

function links(text: string): SummaryInline[] {
  const runs: SummaryInline[] = []
  let read = 0
  for (const match of text.matchAll(LINK)) {
    runs.push({ text: text.slice(read, match.index) })
    runs.push({ text: match[1]!, target: { kind: match[2]!, id: match[3]! } })
    read = match.index + match[0].length
  }
  runs.push({ text: text.slice(read) })
  return runs
}

/**
 * An ability's name or VS Data id reduced to what both say alike: a datasheet's "Damaged: 1-5 Wounds Remaining" or
 * "[Psychic Abilities] - Smite", and an id with "-aura", "-psyker-level-3" or "-once-per-battle" its datasheet prints in
 * brackets or not at all.
 */
export function unitAbilitySlug(name: string) {
  return name
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^\*+/, '')
    .replace(/^\[psychic abilities\]\s*-\s*/, '')
    .replace(/^damaged\b.*$/, 'damaged')
    .replaceAll(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replaceAll(/['’]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .replace(/-(?:aura|psychic(?:-level-\d+)?|psyker-level-\d+|once-per-.*)$/, '')
    .replace(/^damaged-.*$/, 'damaged')
}
