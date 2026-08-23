import { afterEach, describe, expect, it } from 'vitest'
import { configuredObjectStore, DEFAULT_S3_PUBLIC_BASE_URL } from './objectStorage'

const ENV_KEYS = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL', 'S3_REGION'] as const

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
})

describe('configuredObjectStore', () => {
  it('is null until every credential is set', () => {
    expect(configuredObjectStore()).toBeNull()
    process.env.S3_ENDPOINT = 'http://minio:9000'
    process.env.S3_BUCKET = 'praetorium'
    expect(configuredObjectStore()).toBeNull()
  })

  it('falls back to the shared public store when no base URL is set', () => {
    process.env.S3_ENDPOINT = 'http://minio:9000'
    process.env.S3_BUCKET = 'praetorium'
    process.env.S3_ACCESS_KEY_ID = 'id'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'
    expect(configuredObjectStore()?.publicBaseUrl).toBe(DEFAULT_S3_PUBLIC_BASE_URL)
  })

  it('trims a trailing slash from a configured base URL', () => {
    process.env.S3_ENDPOINT = 'http://minio:9000'
    process.env.S3_BUCKET = 'praetorium'
    process.env.S3_ACCESS_KEY_ID = 'id'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'
    process.env.S3_PUBLIC_BASE_URL = 'http://localhost:9000/praetorium/'
    expect(configuredObjectStore()?.publicBaseUrl).toBe('http://localhost:9000/praetorium')
  })
})
