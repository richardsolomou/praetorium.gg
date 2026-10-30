import * as SecureStore from 'expo-secure-store'

const memoryValues = new Map<string, string>()
// Native-auth test builds never touch the keychain; Expo inlines this literal access at build time.
const memoryOnly = Boolean(process.env.EXPO_PUBLIC_NATIVE_AUTH_TEST_APP_URL)

export async function getSecureValue(key: string) {
  if (memoryOnly) return memoryValues.get(key) ?? null
  try {
    return await SecureStore.getItemAsync(key)
  } catch (error) {
    if (!__DEV__) throw error
    return memoryValues.get(key) ?? null
  }
}

export async function setSecureValue(key: string, value: string) {
  if (memoryOnly) {
    memoryValues.set(key, value)
    return
  }
  try {
    await SecureStore.setItemAsync(key, value)
  } catch (error) {
    if (!__DEV__) throw error
    memoryValues.set(key, value)
  }
}

export async function deleteSecureValue(key: string) {
  if (memoryOnly) {
    memoryValues.delete(key)
    return
  }
  try {
    await SecureStore.deleteItemAsync(key)
  } catch (error) {
    if (!__DEV__) throw error
    memoryValues.delete(key)
  }
}
