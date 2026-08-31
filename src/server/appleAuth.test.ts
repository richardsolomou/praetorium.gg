import { generateKeyPair, exportPKCS8, jwtVerify, SignJWT } from 'jose'
import { describe, expect, it, vi } from 'vitest'
import { appleCredentials, appleNotificationResponse, generateAppleClientSecret, revokeAppleToken } from './appleAuth'
import { configuredAuthProviderOptions, configuredAuthProviders } from './authProviders'

describe('Apple authentication', () => {
  it('generates a current client secret from the release key', async () => {
    const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true })
    const secret = await generateAppleClientSecret('gg.praetorium.web', 'ABCDE12345', 'KEY1234567', await exportPKCS8(privateKey))
    const { payload, protectedHeader } = await jwtVerify(secret, publicKey, {
      audience: 'https://appleid.apple.com',
      issuer: 'ABCDE12345',
      subject: 'gg.praetorium.web',
    })

    expect(protectedHeader).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' })
    expect(payload.exp! - payload.iat!).toBe(180 * 24 * 60 * 60)
  })

  it('accepts either a static secret or a complete signing-key configuration', async () => {
    expect(appleCredentials({ APPLE_CLIENT_ID: 'service-id', APPLE_CLIENT_SECRET: 'client-secret' })).toMatchObject({
      clientId: 'service-id',
    })
    expect(
      appleCredentials({
        APPLE_CLIENT_ID: 'service-id',
        APPLE_TEAM_ID: 'ABCDE12345',
        APPLE_KEY_ID: 'KEY1234567',
        APPLE_PRIVATE_KEY: 'private-key',
      }),
    ).toMatchObject({ clientId: 'service-id' })
  })

  it('configures Apple dynamically without treating the app-link team ID as a provider', async () => {
    const { privateKey } = await generateKeyPair('ES256', { extractable: true })
    const environment = {
      APPLE_CLIENT_ID: 'gg.praetorium.web',
      APPLE_TEAM_ID: 'ABCDE12345',
      APPLE_KEY_ID: 'KEY1234567',
      APPLE_PRIVATE_KEY: await exportPKCS8(privateKey),
    }
    const options = configuredAuthProviderOptions(environment)
    const apple = typeof options.apple === 'function' ? await options.apple() : options.apple

    expect(configuredAuthProviders(environment)).toEqual(['apple'])
    expect(apple).toMatchObject({ clientId: 'gg.praetorium.web', clientSecret: expect.any(String) })
    expect(configuredAuthProviders({ APPLE_TEAM_ID: 'ABCDE12345' })).toEqual([])
  })

  it('rejects partial or ambiguous Apple credentials', () => {
    expect(() => appleCredentials({ APPLE_CLIENT_ID: 'service-id' })).toThrow(/Apple sign-in credentials/)
    expect(() => appleCredentials({ APPLE_KEY_ID: 'key-id' })).toThrow(/Apple sign-in credentials/)
    expect(() =>
      appleCredentials({
        APPLE_CLIENT_ID: 'service-id',
        APPLE_CLIENT_SECRET: 'client-secret',
        APPLE_TEAM_ID: 'ABCDE12345',
        APPLE_KEY_ID: 'KEY1234567',
        APPLE_PRIVATE_KEY: 'private-key',
      }),
    ).toThrow(/either APPLE_CLIENT_SECRET or/)
  })

  it('revokes the stored Apple refresh token', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }))

    await revokeAppleToken(
      { clientId: 'service-id', clientSecret: async () => 'client-secret' },
      { token: 'refresh-token', type: 'refresh_token' },
      fetcher,
    )

    expect(fetcher).toHaveBeenCalledWith(
      'https://appleid.apple.com/auth/revoke',
      expect.objectContaining({
        method: 'POST',
        body: new URLSearchParams({
          client_id: 'service-id',
          client_secret: 'client-secret',
          token: 'refresh-token',
          token_type_hint: 'refresh_token',
        }),
      }),
    )
  })

  it('deletes the matching account for signed revocation notifications', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const payload = await new SignJWT({
      events: { type: 'consent-revoked', sub: 'apple-user', event_time: Math.floor(Date.now() / 1000) },
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer('https://appleid.apple.com')
      .setAudience('gg.praetorium')
      .setIssuedAt()
      .setJti('event-id')
      .sign(privateKey)
    const deleted = vi.fn(async () => undefined)

    const response = await appleNotificationResponse(
      new Request('https://praetorium.gg/api/apple-notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload }),
      }),
      deleted,
      ['gg.praetorium'],
      publicKey,
    )

    expect(response.status).toBe(204)
    expect(deleted).toHaveBeenCalledWith('apple-user')
  })

  it('rejects unsigned notifications and acknowledges email relay changes', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256')
    const { publicKey: unrelatedKey } = await generateKeyPair('RS256')
    const relayPayload = await new SignJWT({
      events: { type: 'email-disabled', sub: 'apple-user', event_time: Math.floor(Date.now() / 1000) },
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer('https://appleid.apple.com')
      .setAudience('gg.praetorium')
      .setIssuedAt()
      .setJti('event-id')
      .sign(privateKey)
    const deleted = vi.fn(async () => undefined)
    const relayResponse = await appleNotificationResponse(
      new Request('https://praetorium.gg/api/apple-notifications', {
        method: 'POST',
        body: JSON.stringify({ payload: relayPayload }),
      }),
      deleted,
      ['gg.praetorium'],
      publicKey,
    )
    const invalidResponse = await appleNotificationResponse(
      new Request('https://praetorium.gg/api/apple-notifications', {
        method: 'POST',
        body: JSON.stringify({ payload: relayPayload }),
      }),
      deleted,
      ['gg.praetorium'],
      unrelatedKey,
    )

    expect(relayResponse.status).toBe(204)
    expect(deleted).not.toHaveBeenCalled()
    expect(invalidResponse.status).toBe(400)
  })
})
