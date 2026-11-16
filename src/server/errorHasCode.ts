/** Whether the error, or any error in its `cause` chain, carries this `code`, as Node and libsql errors do. */
export function errorHasCode(error: unknown, code: string): boolean {
  const seen = new Set<unknown>()
  for (
    let current = error;
    current && typeof current === 'object' && !seen.has(current);
    current = (current as { cause?: unknown }).cause
  ) {
    seen.add(current)
    if ((current as { code?: unknown }).code === code) return true
  }
  return false
}
