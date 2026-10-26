import { appendFileSync } from 'node:fs'

/** Prints `key=value` lines and, inside a GitHub Actions step, records them as its outputs. */
export function stepOutput(values: Record<string, string | boolean>) {
  const content = Object.entries(values)
    .map(([key, value]) => `${key}=${value}\n`)
    .join('')
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, content)
  process.stdout.write(content)
}
