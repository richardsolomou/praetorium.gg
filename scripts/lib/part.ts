/** A zero-based `<index>/<count>` slice named by `flag`, such as `--part 0/2`. */
export function parsePart(value: string, flag: string) {
  const match = value.match(/^(\d+)\/(\d+)$/)
  const [index, count] = [Number(match?.[1]), Number(match?.[2])]
  if (!match || count < 1 || index >= count) throw new Error(`${flag} must be a zero-based index and count, for example 0/2`)
  return { index, count }
}
