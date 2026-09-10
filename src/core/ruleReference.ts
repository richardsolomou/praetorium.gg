const BRACKETED_RULE = /\[([\p{L}\p{N} +'"’:/\p{Pd}]+)\]/gu

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

/** A rule's parameter as a datasheet prints one: a number, a die, a threshold, a distance. */
const PARAMETER = /^d?\d+(?:\+\d+)?\+?"?$/

export function ruleReferenceMatches(reference: string, rule: string) {
  return ruleReferenceKeys(reference).includes(normalizeRuleReference(rule))
}

export function bracketedRuleReferences(text: string) {
  return [...text.matchAll(BRACKETED_RULE)].map((match) => match[1])
}

/** Resolve parameters and colon-delimited conditions without matching unrelated name prefixes. */
export function ruleReferenceKeys(reference: string) {
  const wanted = normalizeRuleReference(reference)
  const base = wanted.split(':', 1)[0]!.trim()
  const keys = wanted === base ? [wanted] : [wanted, base]
  for (let at = 0; at < base.length; at += 1) {
    if (base[at] !== ' ' && base[at] !== '-') continue
    const rest = base.slice(at + 1)
    if (PARAMETER.test(rest.split(' ').at(-1) ?? '')) keys.push(base.slice(0, at))
  }
  return keys
}
