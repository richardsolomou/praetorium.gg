import { hashedSourceStrings } from './sourceStrings'

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  self.postMessage(await hashedSourceStrings(event.data))
}
