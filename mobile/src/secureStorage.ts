import * as SecureStore from 'expo-secure-store'

const developmentValues = new Map<string, string>()

export async function getSecureValue(key: string) {
  try {
    return await SecureStore.getItemAsync(key)
  } catch (error) {
    if (!__DEV__) throw error
    return developmentValues.get(key) ?? null
  }
}

export async function setSecureValue(key: string, value: string) {
  try {
    await SecureStore.setItemAsync(key, value)
  } catch (error) {
    if (!__DEV__) throw error
    developmentValues.set(key, value)
  }
}

export async function deleteSecureValue(key: string) {
  try {
    await SecureStore.deleteItemAsync(key)
  } catch (error) {
    if (!__DEV__) throw error
    developmentValues.delete(key)
  }
}
