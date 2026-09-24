const AUTOMATIC_ATTEMPT_LIMIT = 3

export function claimAutomaticAttempt(attempts: Map<string, number>, key: string): boolean {
  const count = attempts.get(key) ?? 0
  if (count >= AUTOMATIC_ATTEMPT_LIMIT) return false
  attempts.set(key, count + 1)
  return true
}

export function automaticAttemptsExhausted(attempts: Map<string, number>, key: string): boolean {
  return (attempts.get(key) ?? 0) >= AUTOMATIC_ATTEMPT_LIMIT
}
