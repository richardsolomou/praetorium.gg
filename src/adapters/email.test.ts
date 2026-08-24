import { describe, expect, it } from 'vitest'
import { emailDelivery } from './email'

describe('SMTP email delivery', () => {
  it('stays disabled when SMTP is not configured', () => {
    expect(emailDelivery({})).toBeUndefined()
  })

  it('rejects a partial SMTP configuration', () => {
    expect(() => emailDelivery({ SMTP_HOST: 'smtp.example.test' })).toThrow('EMAIL_FROM is required for SMTP email')
  })

  it('creates delivery from complete SMTP environment variables', () => {
    expect(
      emailDelivery({
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'user',
        SMTP_PASSWORD: 'password',
        EMAIL_FROM: 'Praetorium <accounts@example.test>',
      }),
    ).toBeDefined()
  })
})
