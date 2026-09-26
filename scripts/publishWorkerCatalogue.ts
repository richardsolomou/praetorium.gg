import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import path from 'node:path'
import { publishWorkerCatalogue } from './lib/workerCataloguePublish'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const accessKeyId = process.env.CATALOGUE_R2_ACCESS_KEY_ID
const secretAccessKey = process.env.CATALOGUE_R2_SECRET_ACCESS_KEY
if (!accountId || !/^[0-9a-f]{32}$/.test(accountId) || !accessKeyId || !secretAccessKey) {
  throw new Error('Catalogue R2 publisher credentials are required')
}

const client = new S3Client({
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  region: 'auto',
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
})
const bucket = 'praetorium-catalogue'
const result = await publishWorkerCatalogue(path.resolve(process.env.WORKER_CATALOGUE_OUTPUT_DIR ?? '.output/worker-catalogue'), {
  get: async (key) => {
    try {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      if (!response.Body) throw new Error(`Worker catalogue ${key} has no body`)
      return response.Body.transformToByteArray()
    } catch (error) {
      if (error instanceof NoSuchKey) return null
      throw error
    }
  },
  put: async (key, bytes) => {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: 'application/json',
        CacheControl: 'private, max-age=31536000, immutable',
      }),
    )
  },
})
console.log(`worker catalogue published: ${result.snapshotId} ${result.manifestSha256}`)
