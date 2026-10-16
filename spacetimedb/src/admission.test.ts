import { describe, expect, it } from 'vitest'
import { admitConnection, authConfiguration, type AdmissionClaims } from './admission'

const NOW = 1_000_000n
const SENDER = 'c200'.padEnd(64, '0')
const ISSUER = 'https://praetorium.gg/api/auth'
const AUDIENCE = 'praetorium'

const access = (payload: Record<string, unknown> = {}, claims: Partial<AdmissionClaims> = {}): AdmissionClaims => ({
  subject: 'session-1',
  issuer: ISSUER,
  audience: [AUDIENCE],
  fullPayload: {
    userId: 'player-1',
    accessExpiresAt: Number(NOW) + 300,
    exp: Number(NOW) + 300,
    tokenType: 'spacetime-access',
    ...payload,
  },
  ...claims,
})

function admit(jwt: AdmissionClaims | null, overrides: { trusted?: boolean; revoked?: string[] } = {}) {
  return admitConnection({
    trusted: overrides.trusted ?? false,
    senderHex: SENDER,
    jwt,
    issuer: ISSUER,
    audience: AUDIENCE,
    now: NOW,
    maxTokenSeconds: 600n,
    isRevoked: (subject) => (overrides.revoked ?? []).includes(subject),
  })
}

describe('admitConnection', () => {
  it('admits a player holding a current access token this deployment issued', () => {
    expect(admit(access({ isAdmin: true }))).toEqual({
      kind: 'player',
      subject: 'session-1',
      userId: 'player-1',
      expiresAt: NOW + 300n,
      isAdmin: true,
    })
  })

  it('refuses a token this deployment did not issue, has revoked, or has let expire', () => {
    expect(admit(null).kind).toBe('refused')
    expect(admit(access({}, { issuer: 'https://other.example/api/auth' })).kind).toBe('refused')
    expect(admit(access({}, { audience: ['another-deployment'] })).kind).toBe('refused')
    expect(admit(access({ tokenType: 'session' })).kind).toBe('refused')
    expect(admit(access(), { revoked: ['session-1'] }).kind).toBe('refused')
    expect(admit(access({ accessExpiresAt: Number(NOW) })).kind).toBe('refused')
    expect(admit(access({ exp: Number(NOW) + 601 })).kind).toBe('refused')
  })

  it('admits a SpacetimeDB guest token only for the identity it was issued to', () => {
    const guest = (hex: string): AdmissionClaims => ({
      subject: 'guest',
      issuer: 'localhost',
      audience: ['spacetimedb'],
      fullPayload: { hex_identity: hex },
    })
    expect(admit(guest(SENDER)).kind).toBe('guest')
    expect(admit(guest('ff'.repeat(32))).kind).toBe('refused')
  })

  it('treats a SpacetimeDB token carrying a player id as a player token, not a guest', () => {
    const claims: AdmissionClaims = {
      subject: 'guest',
      issuer: 'localhost',
      audience: ['spacetimedb'],
      fullPayload: { hex_identity: SENDER, userId: 'player-1' },
    }
    expect(admit(claims).kind).toBe('refused')
  })

  it('lets the owner and the configured operator in without a token', () => {
    expect(admit(null, { trusted: true }).kind).toBe('trusted')
  })
})

describe('authConfiguration', () => {
  const env = { AUTH_ISSUER: ISSUER, AUTH_AUDIENCE: AUDIENCE, OPERATOR_IDENTITY: SENDER }

  it.each([
    ISSUER,
    `https://pr-7.preview.praetorium.gg/api/auth/preview/${'a'.repeat(40)}`,
    'http://127.0.0.1:3000/api/auth',
    'http://localhost/api/auth',
  ])('accepts the issuer %s', (issuer) => {
    expect(authConfiguration({ ...env, AUTH_ISSUER: issuer })).toEqual({ issuer, audience: AUDIENCE, operator: SENDER })
  })

  it.each([
    ['', 'an empty issuer'],
    ['http://praetorium.gg/api/auth', 'a public issuer without HTTPS'],
    ['https://praetorium.gg/api/auth/other', 'another path'],
    ['https://user@praetorium.gg/api/auth', 'credentials'],
    [`https://${'a'.repeat(250)}.gg/api/auth`, 'an overlong issuer'],
  ])('refuses %j (%s)', (issuer) => {
    expect(() => authConfiguration({ ...env, AUTH_ISSUER: issuer })).toThrow('Invalid auth configuration')
  })

  it.each(['', 'Praetorium', '-praetorium'])('refuses the audience %j', (audience) => {
    expect(() => authConfiguration({ ...env, AUTH_AUDIENCE: audience })).toThrow('Invalid auth configuration')
  })

  it.each(['', 'C200'.padEnd(64, '0'), SENDER.slice(1)])('refuses the operator identity %j', (operator) => {
    expect(() => authConfiguration({ ...env, OPERATOR_IDENTITY: operator })).toThrow('Invalid auth configuration')
  })
})
