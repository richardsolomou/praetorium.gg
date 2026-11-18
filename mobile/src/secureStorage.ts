import * as SecureStore from 'expo-secure-store'

const memoryValues = new Map<string, string>()
// Native-auth test builds never touch the keychain; Expo inlines this literal access at build time.
const memoryOnly = Boolean(process.env.EXPO_PUBLIC_NATIVE_AUTH_TEST_APP_URL)

/** Runs `secure` against the keychain, or `memory` in test builds and in development when the keychain fails. */
async function withKeychain<T>(secure: () => Promise<T>, memory: () => T) {
  if (memoryOnly) return memory()
  try {
    return await secure()
  } catch (error) {
    if (!__DEV__) throw error
    return memory()
  }
}

export const getSecureValue = (key: string) =>
  withKeychain(
    () => SecureStore.getItemAsync(key),
    () => memoryValues.get(key) ?? null,
  )

export const setSecureValue = (key: string, value: string) =>
  withKeychain(
    () => SecureStore.setItemAsync(key, value),
    () => {
      memoryValues.set(key, value)
    },
  )

export const deleteSecureValue = (key: string) =>
  withKeychain(
    () => SecureStore.deleteItemAsync(key),
    () => {
      memoryValues.delete(key)
    },
  )
