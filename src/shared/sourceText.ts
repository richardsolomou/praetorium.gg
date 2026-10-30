/**
 * Rules text as Praetorium publishes it: never the words, only where they are.
 *
 * A token names the source file a string came from, how it is shown, and the SHA-256 of
 * the exact string the file holds. Every surface carries tokens in place of text, and a
 * reader's browser that has chosen to load the text swaps each for the string in the
 * pinned upstream file whose hash matches, so a wrong or altered file cannot answer.
 */
/**
 * How a string is shown, applied to the whole source string a token names: `item3` is the
 * fourth bullet of a source's own HTML list, `rest` what that list leaves around it, and
 * `condition` what a secondary card's when-drawn rule says must hold to discard it.
 */
export type TextTransform = 'prose' | 'plain' | 'trim' | 'rest' | 'condition' | `item${number}`
const TRANSFORM = String.raw`prose|plain|trim|rest|condition|item\d{1,3}`

/** The hash is truncated: it identifies one string within one file, it does not have to resist a search of all strings. */
export const TEXT_HASH_LENGTH = 16

const OPEN = '⟦'
const CLOSE = '⟧'
const TOKEN = new RegExp(`${OPEN}([0-9a-f]{8}):(${TRANSFORM}):([0-9a-f]{${TEXT_HASH_LENGTH}})${CLOSE}`, 'g')

export type TextToken = { file: string; transform: TextTransform; hash: string }

/** The community sources rules text loads from: BSData's catalogue files and Game Datacards' cards, each chosen on its own. */
export const TEXT_SOURCES = ['bsdata', 'game-datacards'] as const
export type TextSource = (typeof TEXT_SOURCES)[number]
/** Where one file a token names lives upstream, and which source it belongs to. */
export type TextSourceFile = { url: string; source: TextSource }

export const textToken = ({ file, transform, hash }: TextToken) => `${OPEN}${file}:${transform}:${hash}${CLOSE}`

export const hasTextTokens = (text: string) => text.includes(OPEN)

export function textTokensIn(text: string): TextToken[] {
  return [...text.matchAll(TOKEN)].map(([, file, transform, hash]) => ({ file: file!, transform: transform as TextTransform, hash: hash! }))
}

/**
 * The text with every token swapped for what `lookup` finds, or for `missing` where it
 * finds nothing — the reader has not loaded that file, or the file holds no such string.
 */
export function resolvedText(text: string, lookup: (token: TextToken) => string | null, missing: (token: TextToken) => string) {
  if (!hasTextTokens(text)) return text
  return text.replaceAll(TOKEN, (_, file: string, transform: TextTransform, hash: string) => {
    const token = { file, transform, hash }
    return lookup(token) ?? missing(token)
  })
}

/** What a parser is given in place of a source's words: a function that says how to publish a string. */
export type SourceTexts = (raw: string, transform: TextTransform) => string

/** A token's identity without its file: one string copied into two files is one text, wherever it is read from. */
export const textKey = (token: Pick<TextToken, 'transform' | 'hash'>) => `${token.transform}:${token.hash}`

/** A text compared by what it says, so a card two files print alike is still one card. */
export const comparableText = (text: string) =>
  hasTextTokens(text)
    ? text.replaceAll(TOKEN, (_, _file: string, transform: string, hash: string) => `${OPEN}${transform}:${hash}${CLOSE}`)
    : text

/** The text with every token removed, for surfaces that publish facts only. */
export const withoutText = (text: string) =>
  resolvedText(
    text,
    () => null,
    () => '',
  ).trim()

/**
 * The text with every token removed, for agents and reference pages that cannot load the words:
 * headings and labels such as `**When:**` that only framed them say nothing alone, so they go too.
 */
export function publishedFacts(text: string) {
  const facts = withoutText(text)
  return hasTextTokens(text) && facts.split('\n').every((line) => FRAME_LINE.test(line)) ? '' : facts
}

const FRAME_LINE = /^\s*(?:#{1,6}\s.*|\*{1,3}[^*\n]+(?::\*{1,3}|\*{1,3}:))?\s*$/

/** A value with every token removed from every string in it, for answers that go to agents and other programs. */
export function withoutTexts<T>(value: T): T {
  if (typeof value === 'string') return (hasTextTokens(value) ? publishedFacts(value) : value) as T
  if (Array.isArray(value)) return value.map(withoutTexts) as T
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, withoutTexts(entry)])) as T
  return value
}

/**
 * Where a withheld text can be read instead: its pinned upstream file, that file's source,
 * and the id of the record holding it there, when the record names one.
 */
export type TextPointer = { source: TextSource; url: string; id?: string }

/**
 * Where every file a token names lives upstream, whether one of those files holds a record by its
 * id, and which record in it holds the string a token names.
 */
export type TextLocations = {
  files: Readonly<Record<string, TextSourceFile>>
  holds: (url: string, id: string) => boolean
  recordsHolding: (url: string, hash: string) => readonly string[]
}

/**
 * The upstream files the tokens in these texts name, once each, located by the record in each file
 * that holds the text, `id` first when several do, or else by `id` where the file holds a record
 * by it; a text drawn from a shared rule elsewhere is pointed at by file alone.
 */
export function textPointersIn(texts: readonly (string | null | undefined)[], locations: TextLocations, id?: string): TextPointer[] {
  const pointers = new Map<string, TextPointer>()
  for (const text of texts)
    for (const { file, hash } of text ? textTokensIn(text) : []) {
      const found = locations.files[file]
      if (!found || pointers.has(found.url)) continue
      const holding = locations.recordsHolding(found.url, hash)
      const record = id && holding.includes(id) ? id : (holding[0] ?? (id && locations.holds(found.url, id) ? id : undefined))
      pointers.set(found.url, { ...found, ...(record ? { id: record } : {}) })
    }
  return [...pointers.values()]
}

/**
 * A value with every token removed, where each record that lost text says where to read it:
 * `textSources` beside its fields, located by the record's own `id`. Agents and other
 * programs get names, numbers and these pointers, never the words.
 */
export function withTextPointers<T>(value: T, locations: TextLocations): T {
  if (typeof value === 'string') return withoutTexts(value)
  if (Array.isArray(value)) return value.map((entry) => withTextPointers(entry, locations)) as T
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value
  const record = value as Record<string, unknown>
  const strings = Object.values(record).filter((entry): entry is string => typeof entry === 'string' && hasTextTokens(entry))
  const pointers = textPointersIn(strings, locations, typeof record.id === 'string' ? record.id : undefined)
  const published = Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, withTextPointers(entry, locations)]))
  return (pointers.length ? { ...published, textSources: pointers } : published) as T
}

/** Every string a parsed source file holds, the strings a token can name. */
export function sourceStrings(parsed: unknown): Set<string> {
  const found = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === 'string') found.add(value)
    else if (Array.isArray(value)) for (const entry of value) visit(entry)
    else if (value && typeof value === 'object') for (const entry of Object.values(value)) visit(entry)
  }
  visit(parsed)
  return found
}
