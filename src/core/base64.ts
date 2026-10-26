const CHUNK = 0x8000

/** Spreading a large array into one call overflows the stack, so bytes become a string a chunk at a time. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += CHUNK) binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK))
  return btoa(binary)
}

/** URL-safe base64 without padding. */
export const toBase64Url = (bytes: Uint8Array): string => toBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

/** Throws on text that is not base64. */
export const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (character) => character.charCodeAt(0))

/** The longest image data URL `bytes` encode to: base64 grows bytes by a third, and the prefix is at most `data:image/jpeg;base64,`. */
export const imageDataUrlMaxLength = (bytes: number) => Math.ceil(bytes / 3) * 4 + 32
