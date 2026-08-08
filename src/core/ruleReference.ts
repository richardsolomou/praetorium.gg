const BRACKETED_RULE = /\[([\p{L}\p{N} +'"’\p{Pd}]+)\]/gu

export function normalizeRuleReference(value: string) {
  return value
    .replace(/^\[|\]$/g, '')
    .replaceAll(/\^\^|\*/g, '')
    .normalize('NFKC')
    .replaceAll(/\p{Pd}/gu, '-')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

export function ruleReferenceMatches(reference: string, rule: string) {
  const wanted = normalizeRuleReference(reference)
  const candidate = normalizeRuleReference(rule)
  return wanted === candidate || wanted.startsWith(`${candidate} `) || wanted.startsWith(`${candidate}-`)
}

export function bracketedRuleReferences(text: string) {
  return [...text.matchAll(BRACKETED_RULE)].map((match) => match[1])
}
