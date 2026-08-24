import { createSmtpDelivery, smtpConfigFromEnvironment } from 'ras-stack/email'

export function emailDelivery(environment: NodeJS.ProcessEnv = process.env) {
  const config = smtpConfigFromEnvironment(environment)
  return config ? createSmtpDelivery(config) : undefined
}
