import type { PrintOptions } from 'expo-print'

export async function printDocument(html: string, print: (options: PrintOptions) => Promise<void>) {
  try {
    // Expo's iOS renderer ignores CSS page margins; its dimensions use 72 points per inch.
    await print({ html, margins: { top: 34.02, right: 34.02, bottom: 34.02, left: 34.02 } })
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_PRINT_INCOMPLETE') return
    throw error
  }
}
