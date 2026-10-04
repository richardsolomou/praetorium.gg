export function newerRelease(current: string, latest: string) {
  if (!/^\d+\.\d+\.\d+$/.test(current) || !/^\d+\.\d+\.\d+$/.test(latest)) return false
  const a = current.split('.').map(Number)
  const b = latest.split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return b[index]! > a[index]!
  }
  return false
}
