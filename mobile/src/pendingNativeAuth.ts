import type { NativeAuthProof } from './nativeAuth'

const PROVIDER_AUTH_MILLISECONDS = 15 * 60 * 1000
const EXCHANGE_MILLISECONDS = 3 * 60 * 1000

export type PendingNativeAuth = NativeAuthProof & { callbackUrl?: string; expiresAt: number }

export function pendingNativeAuth(proof: NativeAuthProof, now = Date.now()): PendingNativeAuth {
  return { ...proof, expiresAt: now + PROVIDER_AUTH_MILLISECONDS }
}

export function completedPendingNativeAuth(proof: NativeAuthProof, callbackUrl: string, now = Date.now()): PendingNativeAuth {
  return { ...proof, callbackUrl, expiresAt: now + EXCHANGE_MILLISECONDS }
}

export function parsePendingNativeAuth(value: string | null, now = Date.now()): PendingNativeAuth | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (
      typeof parsed.challenge !== 'string' ||
      !/^[\w-]{43}$/.test(parsed.challenge) ||
      typeof parsed.verifier !== 'string' ||
      !/^[\w-]{43}$/.test(parsed.verifier) ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt <= now ||
      (parsed.callbackUrl !== undefined && typeof parsed.callbackUrl !== 'string')
    ) {
      return null
    }
    return {
      challenge: parsed.challenge,
      verifier: parsed.verifier,
      expiresAt: parsed.expiresAt,
      ...(parsed.callbackUrl ? { callbackUrl: parsed.callbackUrl } : {}),
    }
  } catch {
    return null
  }
}
