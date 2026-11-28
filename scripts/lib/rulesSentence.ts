const SUBJECT = /^(?:notice\b|this\b|the\b|all\b|each\b|every\b|for every\b|any\b|one\b|up to\b|\d+\s+(?:in every\s+\d+\s+)?models?\b)/i
const MODAL = /\b(?:can|may|must|is|are)\b/i

/**
 * A BSData entry name that is a rules sentence rather than a name: an older catalogue's option named for its instruction,
 * as "This model can be equipped with …", or a notice. A name such as "The Flesh is Weak" is too short to be one.
 */
export function readsAsRulesSentence(name: string) {
  const words = name.trim().split(/\s+/).length
  return words >= 12 || (words >= 6 && SUBJECT.test(name.trim()) && MODAL.test(name))
}
