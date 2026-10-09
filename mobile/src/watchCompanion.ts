import { requireOptionalNativeModule, type NativeModule } from 'expo'
import type { WatchBattle } from '../../src/contracts/watchBattle'

declare class WatchCompanion extends NativeModule<{ availabilityChanged: (event: { available: boolean }) => void }> {
  isAvailable(): boolean
  publish(snapshot: string): Promise<void>
}

const companion = requireOptionalNativeModule<WatchCompanion>('PraetoriumWatch')

export const isWatchCompanionAvailable = () => companion?.isAvailable() ?? false

export function subscribeWatchAvailability(listener: (available: boolean) => void) {
  const subscription = companion?.addListener('availabilityChanged', ({ available }) => listener(available))
  listener(isWatchCompanionAvailable())
  return () => subscription?.remove()
}

export async function publishWatchBattle(snapshot: WatchBattle | null) {
  await companion?.publish(snapshot ? JSON.stringify(snapshot) : '')
}
