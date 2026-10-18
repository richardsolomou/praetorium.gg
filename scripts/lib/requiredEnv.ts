/** A set, single-line environment value without surrounding whitespace, as secrets pasted into CI often carry. */
export function requiredEnv(name: string, environment: NodeJS.ProcessEnv = process.env) {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  if (/[\r\n]/.test(value)) throw new Error(`${name} must be one line`)
  return value
}
