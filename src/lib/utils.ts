import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Every render of every control merges the same few class lists, so each answer is kept rather than worked out again. */
const merged = new Map<string, string>()
const MERGED_LIMIT = 2_000

/**
 * Merges classes the way Tailwind would apply them.
 *
 * The app is dark only, so `dark:` styles always apply (see `src/styles.css`). They are
 * merged under their unprefixed name so a caller's class replaces a vendored dark default
 * instead of losing to it on stylesheet order.
 */
export function cn(...inputs: ClassValue[]) {
  const classes = clsx(inputs)
  let result = merged.get(classes)
  if (result === undefined) {
    result = mergeClasses(classes)
    if (merged.size >= MERGED_LIMIT) merged.clear()
    merged.set(classes, result)
  }
  return result
}

function mergeClasses(classes: string) {
  const named = new Map<string, string>()
  for (const name of classes.split(/\s+/)) if (name) named.set(name.replace(/^dark:/, ''), name)
  return twMerge([...named.keys()].join(' '))
    .split(' ')
    .map((name) => named.get(name) ?? name)
    .join(' ')
}
