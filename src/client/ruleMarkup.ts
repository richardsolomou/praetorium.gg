/**
 * Reading the markup the rules documents are written in.
 *
 * The datacards source writes its rules as text with a small fixed set of tags —
 * bold, italic, underline, a keyword, a bullet list and a table — mixed with the
 * Markdown its examples and captions are emphasised in, and this turns one of those
 * strings into the blocks a page draws. It is a reader rather than an HTML parser on
 * purpose: only these tags mean anything, so `<move type>` in the middle of a
 * sentence stays the words the rule prints rather than becoming an element, and
 * nothing from the source is ever handed to the browser as markup.
 *
 * A number in brackets is how one rule quotes another. Those are marked here and
 * resolved by the page, which is the only place that knows which rules it can reach.
 */
export type RuleInline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: RuleInline[] }
  | { kind: 'emphasis'; children: RuleInline[] }
  | { kind: 'underline'; children: RuleInline[] }
  | { kind: 'keyword'; children: RuleInline[] }
  /** `(10.05)`, as printed, beside the number on its own so a page can link it. */
  | { kind: 'reference'; code: string; text: string }

export type RuleTableCell = { header: boolean; content: RuleInline[] }
export type RuleMarkupBlock =
  | { kind: 'paragraph'; content: RuleInline[] }
  | { kind: 'list'; items: RuleMarkupBlock[][] }
  | { kind: 'table'; rows: RuleTableCell[][] }

type InlineKind = 'strong' | 'emphasis' | 'underline' | 'keyword'
const INLINE_TAGS: Record<string, InlineKind> = { b: 'strong', i: 'emphasis', u: 'underline', k: 'keyword' }
/** Every tag the source writes. `appref` and `tbody` say nothing a reader can see. */
const READABLE_TAGS = new Set(['b', 'i', 'u', 'k', 'ul', 'li', 'table', 'tbody', 'tr', 'td', 'th', 'appref'])
const TAG = /<(\/?)([a-z]+)>/g
const QUOTED_RULE = /\((\d{2}(?:\.\d{2})+)\)/g

export function parseRuleMarkup(markup: string): RuleMarkupBlock[] {
  return blocksOf(treeOf(markup))
}

type Element = { name: string; children: Node[] }
type Node = Element | { text: string }

const isElement = (node: Node): node is Element => 'name' in node

function treeOf(markup: string): Node[] {
  const root: Element = { name: '', children: [] }
  const open: Element[] = [root]
  let read = 0
  const takeText = (upTo: number) => {
    const text = markup.slice(read, upTo)
    if (text) open.at(-1)?.children.push({ text })
  }
  for (const match of markup.matchAll(TAG)) {
    const [tag, closing, name] = match
    if (!READABLE_TAGS.has(name!)) continue
    takeText(match.index)
    read = match.index + tag.length
    if (closing) {
      // A tag the source never closed is closed here rather than swallowing the rest.
      const depth = open.findLastIndex((element) => element.name === name)
      if (depth > 0) open.length = depth
      continue
    }
    const element: Element = { name: name!, children: [] }
    open.at(-1)?.children.push(element)
    open.push(element)
  }
  takeText(markup.length)
  return root.children
}

function blocksOf(nodes: readonly Node[]): RuleMarkupBlock[] {
  const blocks: RuleMarkupBlock[] = []
  let run: Node[] = []
  const flush = () => {
    blocks.push(...paragraphsOf(run))
    run = []
  }
  for (const node of nodes) {
    if (isElement(node) && (node.name === 'ul' || node.name === 'table')) {
      flush()
      blocks.push(...(node.name === 'ul' ? listBlocks(node) : [tableOf(node)]))
      continue
    }
    run.push(node)
  }
  flush()
  return blocks
}

/**
 * The source breaks its paragraphs with a newline rather than with a tag, and writes
 * the odd list as Markdown bullets rather than as one.
 */
function paragraphsOf(nodes: readonly Node[]): RuleMarkupBlock[] {
  const blocks: RuleMarkupBlock[] = []
  for (const line of linesOf(nodes)) {
    const content = line.nodes.flatMap((part) => (typeof part === 'string' ? textInlines(part) : inlinesOf([part])))
    if (!content.some((inline) => inline.kind !== 'text' || inline.text.trim())) continue
    const paragraph = { kind: 'paragraph', content } as const
    const previous = blocks.at(-1)
    // Consecutive bullets are one list, so a run of them does not become a run of lists.
    if (line.bullet && previous?.kind === 'list') previous.items.push([paragraph])
    else blocks.push(line.bullet ? { kind: 'list', items: [[paragraph]] } : paragraph)
  }
  return blocks
}

type Line = { bullet: boolean; nodes: (string | Element)[] }

/** A Markdown bullet, which the source writes as a line of its own. */
const BULLET = /^[ \t]*-[ \t]+/

function linesOf(nodes: readonly Node[]): Line[] {
  const lines: Line[] = [{ bullet: false, nodes: [] }]
  const start = (text: string) => {
    const bullet = BULLET.test(text)
    lines.push({ bullet, nodes: [bullet ? text.replace(BULLET, '') : text] })
  }
  for (const node of nodes) {
    if (isElement(node)) {
      lines.at(-1)?.nodes.push(node)
      continue
    }
    const [first, ...rest] = node.text.split(/\n+/)
    const line = lines.at(-1)
    // A bullet only counts where the line begins, which is where this text node does.
    if (line && !line.nodes.length && BULLET.test(first ?? '')) {
      line.bullet = true
      line.nodes.push((first ?? '').replace(BULLET, ''))
    } else line?.nodes.push(first ?? '')
    for (const part of rest) start(part)
  }
  return lines
}

/**
 * The bullets, and whatever the source left loose inside the list.
 *
 * A list is not always closed before the sentence that follows it, so anything in
 * there that is not a bullet is read after the list rather than dropped.
 */
function listBlocks(element: Element): RuleMarkupBlock[] {
  const items: RuleMarkupBlock[][] = []
  const loose: Node[] = []
  for (const child of element.children) {
    if (isElement(child) && child.name === 'li') items.push(blocksOf(child.children))
    // A sub-list is written beside the bullet it belongs under rather than inside it.
    else if (isElement(child) && child.name === 'ul') (items.at(-1) ?? items[items.push([]) - 1]!).push(...listBlocks(child))
    else loose.push(child)
  }
  return [{ kind: 'list', items }, ...paragraphsOf(loose)]
}

const tableOf = (element: Element): RuleMarkupBlock => ({ kind: 'table', rows: rowsOf(element) })

function rowsOf(element: Element): RuleTableCell[][] {
  return element.children.flatMap((child) => {
    if (!isElement(child)) return []
    // `tbody` says nothing a reader sees, so its rows are the table's rows.
    if (child.name === 'tbody') return rowsOf(child)
    if (child.name !== 'tr') return []
    const cells = child.children
      .filter((cell): cell is Element => isElement(cell) && (cell.name === 'td' || cell.name === 'th'))
      .map((cell) => ({ header: cell.name === 'th', content: inlinesOf(cell.children) }))
    return cells.length ? [cells] : []
  })
}

function inlinesOf(nodes: readonly Node[]): RuleInline[] {
  return nodes.flatMap((node): RuleInline[] => {
    if (!isElement(node)) return textInlines(node.text)
    const kind = INLINE_TAGS[node.name]
    const children = inlinesOf(node.children)
    return kind ? [{ kind, children }] : children
  })
}

/** Inside a sentence — within emphasis, or in a table cell — a newline is only wrapping. */
function textInlines(text: string): RuleInline[] {
  const collapsed = text.replaceAll(/[ \t]*\n[ \t]*/g, ' ')
  return collapsed ? emphasisedText(collapsed, 0) : []
}

/**
 * The source also emphasises with Markdown, and marks its footnotes with the same
 * character.
 *
 * `***both***`, `**bold**` and `*italic*` are read where they are written as
 * Markdown writes them: the delimiters are exactly as long on both sides, they sit
 * against the words they emphasise rather than against a space, and they open and
 * close on one line. Everything else — a lone marker, a run of three closed by one,
 * the asterisk a table hangs a footnote off — stays the character the source printed,
 * because a marker read as emphasis would swallow the sentence after it.
 */
const EMPHASIS = [
  { delimiter: String.raw`\*\*\*`, kinds: ['strong', 'emphasis'] },
  { delimiter: String.raw`\*\*`, kinds: ['strong'] },
  { delimiter: String.raw`\*`, kinds: ['emphasis'] },
] as const satisfies readonly { delimiter: string; kinds: readonly InlineKind[] }[]

const EMPHASIS_PATTERNS = EMPHASIS.map(({ delimiter, kinds }) => ({
  kinds,
  pattern: new RegExp(`(?<!\\*)${delimiter}(?!\\*)(?=\\S)((?:(?!${delimiter})[^\\n])+?)(?<=\\S)(?<!\\*)${delimiter}(?!\\*)`, 'g'),
}))

function emphasisedText(text: string, level: number): RuleInline[] {
  const rule = EMPHASIS_PATTERNS[level]
  if (!rule) return quotedRules(text)
  const inlines: RuleInline[] = []
  let read = 0
  for (const match of text.matchAll(rule.pattern)) {
    inlines.push(...emphasisedText(text.slice(read, match.index), level + 1))
    inlines.push(wrapped(rule.kinds, emphasisedText(match[1]!, level + 1)))
    read = match.index + match[0].length
  }
  inlines.push(...emphasisedText(text.slice(read), level + 1))
  return inlines
}

/** `***both***` is emphasis inside emphasis, which is how Markdown says it. */
function wrapped(kinds: readonly InlineKind[], children: RuleInline[]): RuleInline {
  const [kind, ...rest] = kinds
  return { kind: kind ?? 'strong', children: rest.length ? [wrapped(rest, children)] : children }
}

/** The plainest reading of all: words, and the numbers among them that name a rule. */
function quotedRules(text: string): RuleInline[] {
  if (!text) return []
  const inlines: RuleInline[] = []
  let read = 0
  for (const match of text.matchAll(QUOTED_RULE)) {
    const before = text.slice(read, match.index)
    if (before) inlines.push({ kind: 'text', text: before })
    inlines.push({ kind: 'reference', code: match[1]!, text: match[0] })
    read = match.index + match[0].length
  }
  const after = text.slice(read)
  if (after) inlines.push({ kind: 'text', text: after })
  return inlines
}
