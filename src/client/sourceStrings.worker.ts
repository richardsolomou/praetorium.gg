import { hashedSourceStrings, HASHING_FAILED } from './sourceStrings'

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  // A rejection here never reaches the worker's error event, so a failure must still answer.
  self.postMessage(await hashedSourceStrings(event.data).catch(() => HASHING_FAILED))
}
