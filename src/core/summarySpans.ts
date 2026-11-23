type Span = { start: number; end: number }

/**
 * A summary cut at its spans, each piece with where it starts and the span it lies in, if any. Offsets are UTF-16 code
 * units with an exclusive end, so they index the string as JavaScript does; a span that is out of
 * range, empty, or overlaps the one before it is left out rather than misplacing the text around it.
 */
export function summarySegments<S extends Span>(text: string, spans: readonly S[]) {
  const segments: { text: string; start: number; span?: S }[] = []
  let read = 0
  for (const span of spans.toSorted((left, right) => left.start - right.start)) {
    if (span.start < read || span.end <= span.start || span.end > text.length) continue
    if (span.start > read) segments.push({ text: text.slice(read, span.start), start: read })
    segments.push({ text: text.slice(span.start, span.end), start: span.start, span })
    read = span.end
  }
  if (read < text.length) segments.push({ text: text.slice(read), start: read })
  return segments
}
