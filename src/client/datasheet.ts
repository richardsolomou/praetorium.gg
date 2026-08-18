export function compositionCount(composition: readonly string[]) {
  const groups = composition.flatMap((line) => {
    const count = line.match(/(\d+)(?:\s*[-–]\s*(\d+))?/)
    return count ? [{ minimum: Number(count[1]), maximum: Number(count[2] ?? count[1]) }] : []
  })
  if (!groups.length) return `${composition.length} ${composition.length === 1 ? 'model' : 'models'}`

  const minimum = groups.reduce((total, group) => total + group.minimum, 0)
  const maximum = groups.reduce((total, group) => total + group.maximum, 0)
  const count = minimum === maximum ? String(minimum) : `${minimum}–${maximum}`
  return `${count} ${maximum === 1 ? 'model' : 'models'}`
}
