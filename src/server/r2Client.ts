import { AwsClient } from 'aws4fetch'

export function r2Client(environment: NodeJS.ProcessEnv = process.env) {
  const account = environment.R2_ACCOUNT_ID
  const accessKeyId = environment.R2_ACCESS_KEY_ID
  const secretAccessKey = environment.R2_SECRET_ACCESS_KEY
  if (!account && !accessKeyId && !secretAccessKey) return null
  if (!/^[0-9a-f]{32}$/.test(account ?? '') || !accessKeyId || !secretAccessKey)
    throw new Error('Incomplete R2 object storage configuration')
  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto', retries: 2 }),
    base: `https://${account}.r2.cloudflarestorage.com/praetorium/`,
  }
}
