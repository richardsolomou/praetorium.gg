import { Container, ContainerProxy, getContainer } from '@cloudflare/containers'
import { handleD1Bridge } from '../src/server/d1Bridge'
import { spacetimeSocket } from './spacetimeProxy'

type Environment = {
  WEB: DurableObjectNamespace<WebContainer>
  AUTH_DB: D1Database
  APP_URL: string
  AUTH_SECRET: string
  SPACETIME_AUDIENCE: string
  SPACETIME_URL: string
  SPACETIME_DATABASE: string
  SPACETIME_OPERATOR_TOKEN: string
  SPACETIME_ACCESS_CLIENT_ID: string
  SPACETIME_ACCESS_CLIENT_SECRET: string
  PRAETORIUM_SEED_PREVIEW?: string
  APPLE_TEAM_ID?: string
  ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS?: string
  APPLE_CLIENT_ID?: string
  APPLE_KEY_ID?: string
  APPLE_PRIVATE_KEY?: string
  APPLE_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  DISCORD_CLIENT_ID?: string
  DISCORD_CLIENT_SECRET?: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_SECURE?: string
  SMTP_USER?: string
  SMTP_PASSWORD?: string
  EMAIL_FROM?: string
  S3_ENDPOINT?: string
  S3_BUCKET?: string
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
  S3_PUBLIC_BASE_URL?: string
  CATALOGUE_BASE_URL?: string
  CATALOGUE_UPDATE_MODE?: string
  CATALOGUE_DISABLED_SOURCES?: string
  EXPO_PUSH_ACCESS_TOKEN?: string
  TYPESAFE_API_KEY?: string
  AUTH_RATE_LIMIT?: string
  POSTHOG_PROJECT_ID?: string
  POSTHOG_HOST?: string
  POSTHOG_API_KEY?: string
}

export { ContainerProxy }

export class WebContainer extends Container<Environment> {
  defaultPort = 3000
  sleepAfter = '15m'
  envVars = Object.fromEntries(
    Object.entries({
      NODE_ENV: 'production',
      APP_URL: this.env.APP_URL,
      AUTH_SECRET: this.env.AUTH_SECRET,
      SPACETIME_AUDIENCE: this.env.SPACETIME_AUDIENCE,
      SPACETIME_URL: this.env.SPACETIME_URL,
      SPACETIME_DATABASE: this.env.SPACETIME_DATABASE,
      SPACETIME_OPERATOR_TOKEN: this.env.SPACETIME_OPERATOR_TOKEN,
      SPACETIME_ACCESS_CLIENT_ID: this.env.SPACETIME_ACCESS_CLIENT_ID,
      SPACETIME_ACCESS_CLIENT_SECRET: this.env.SPACETIME_ACCESS_CLIENT_SECRET,
      PRAETORIUM_SEED_PREVIEW: this.env.PRAETORIUM_SEED_PREVIEW ?? '',
      APPLE_TEAM_ID: this.env.APPLE_TEAM_ID,
      ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS: this.env.ANDROID_APP_CERTIFICATE_SHA256_FINGERPRINTS,
      APPLE_CLIENT_ID: this.env.APPLE_CLIENT_ID,
      APPLE_KEY_ID: this.env.APPLE_KEY_ID,
      APPLE_PRIVATE_KEY: this.env.APPLE_PRIVATE_KEY,
      APPLE_CLIENT_SECRET: this.env.APPLE_CLIENT_SECRET,
      GOOGLE_CLIENT_ID: this.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: this.env.GOOGLE_CLIENT_SECRET,
      DISCORD_CLIENT_ID: this.env.DISCORD_CLIENT_ID,
      DISCORD_CLIENT_SECRET: this.env.DISCORD_CLIENT_SECRET,
      SMTP_HOST: this.env.SMTP_HOST,
      SMTP_PORT: this.env.SMTP_PORT,
      SMTP_SECURE: this.env.SMTP_SECURE,
      SMTP_USER: this.env.SMTP_USER,
      SMTP_PASSWORD: this.env.SMTP_PASSWORD,
      EMAIL_FROM: this.env.EMAIL_FROM,
      S3_ENDPOINT: this.env.S3_ENDPOINT,
      S3_BUCKET: this.env.S3_BUCKET,
      S3_ACCESS_KEY_ID: this.env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: this.env.S3_SECRET_ACCESS_KEY,
      S3_PUBLIC_BASE_URL: this.env.S3_PUBLIC_BASE_URL,
      CATALOGUE_BASE_URL: this.env.CATALOGUE_BASE_URL,
      CATALOGUE_UPDATE_MODE: this.env.CATALOGUE_UPDATE_MODE,
      CATALOGUE_DISABLED_SOURCES: this.env.CATALOGUE_DISABLED_SOURCES,
      EXPO_PUSH_ACCESS_TOKEN: this.env.EXPO_PUSH_ACCESS_TOKEN,
      TYPESAFE_API_KEY: this.env.TYPESAFE_API_KEY,
      AUTH_RATE_LIMIT: this.env.AUTH_RATE_LIMIT,
      POSTHOG_PROJECT_ID: this.env.POSTHOG_PROJECT_ID,
      POSTHOG_HOST: this.env.POSTHOG_HOST,
      POSTHOG_API_KEY: this.env.POSTHOG_API_KEY,
    }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

WebContainer.outboundByHost = {
  'd1.internal': (request: Request, environment: Environment) => handleD1Bridge(request, environment.AUTH_DB),
}

export default {
  fetch(request: Request, environment: Environment) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/spacetime/')) return spacetimeSocket(request, environment)
    return getContainer(environment.WEB, 'web').fetch(request)
  },
}
