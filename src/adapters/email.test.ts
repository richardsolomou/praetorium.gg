import { describe, expect, it } from 'vitest'
import { emailDelivery } from './email'

describe('SMTP email delivery', () => {
  it('stays disabled when SMTP is not configured', () => {
    expect(emailDelivery({})).toBeUndefined()
  })

  it('rejects a partial SMTP configuration', () => {
    expect(() => emailDelivery({ SMTP_HOST: 'smtp.example.test' })).toThrow('EMAIL_FROM is required for SMTP email')
  })
})
