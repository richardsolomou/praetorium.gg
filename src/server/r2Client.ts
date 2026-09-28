import { AwsClient } from 'aws4fetch'

function client(environment: NodeJS.ProcessEnv, prefix: string, bucket: string) {
  const account = environment.R2_ACCOUNT_ID
  const accessKeyId = environment[`${prefix}_ACCESS_KEY_ID`]
  const secretAccessKey = environment[`${prefix}_SECRET_ACCESS_KEY`]
  if (!account && !accessKeyId && !secretAccessKey) return null
  if (!/^[0-9a-f]{32}$/.test(account ?? '') || !accessKeyId || !secretAccessKey)
    throw new Error('Incomplete R2 object storage configuration')
  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto', retries: 2 }),
    base: `https://${account}.r2.cloudflarestorage.com/${bucket}/`,
  }
}

export function privateR2Client(environment: NodeJS.ProcessEnv = process.env) {
  return client(environment, 'R2', 'praetorium-private')
}

export function publicAssetsR2Client(environment: NodeJS.ProcessEnv = process.env) {
  return client(environment, 'ASSETS_R2', 'praetorium')
}
