export const normalizedText = (value: string) => value.normalize('NFC').toLowerCase()

export const sameText = (left: string, right: string) => normalizedText(left) === normalizedText(right)

export function compareText(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
