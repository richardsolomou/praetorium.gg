import { NATIVE_AUTH_CALLBACK_URL } from './nativeAuth'

export async function initialLaunch<T>(
  url: string | null,
  pendingAuth: Promise<T>,
  openPage: (url: string | null) => void,
  resumeAuth: (url: string | null, pendingAuth: T) => Promise<void>,
) {
  if (!url?.startsWith(NATIVE_AUTH_CALLBACK_URL)) openPage(url)
  await resumeAuth(url, await pendingAuth)
}
