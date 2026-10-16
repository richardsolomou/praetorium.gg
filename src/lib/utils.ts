import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges classes the way Tailwind would apply them.
 *
 * The app is dark only, so `dark:` styles always apply (see `src/styles.css`). They are
 * merged under their unprefixed name so a caller's class replaces a vendored dark default
 * instead of losing to it on stylesheet order.
 */
export function cn(...inputs: ClassValue[]) {
  const named = new Map<string, string>()
  for (const name of clsx(inputs).split(/\s+/)) if (name) named.set(name.replace(/^dark:/, ''), name)
  return twMerge([...named.keys()].join(' '))
    .split(' ')
    .map((name) => named.get(name) ?? name)
    .join(' ')
}
