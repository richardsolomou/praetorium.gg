export function compositionCount(composition: readonly string[]) {
  const count = composition
    .join(' ')
    .match(/\d+(?:\s*[-–]\s*\d+)?/)?.[0]
    ?.replace(/\s+/g, '')
  const value = count ?? String(composition.length)
  return `${value} ${value === '1' ? 'model' : 'models'}`
}
