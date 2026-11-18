import { MAX_REFERENCE_PART_BYTES, queryIndex } from '../../contracts/offlineReference'
import type { ReferenceWorkerAnswer, ReferenceWorkerRequest } from './reference.worker'
import { readPart } from './referenceStore'

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; inPage: () => void }

let worker: Promise<Worker | null> | undefined
const pending = new Map<number, Pending>()
let requests = 0

const decodeInPage = async (asset: string, key: string, network: boolean) =>
  queryIndex(await readPart(asset, MAX_REFERENCE_PART_BYTES, network)).get(key)

/** The worker that decodes parts, or null where none can run, which leaves the page to decode them itself. */
function referenceWorker() {
  worker ??=
    typeof Worker === 'undefined'
      ? Promise.resolve(null)
      : import('./reference.worker?worker&inline').then(
          ({ default: ReferenceWorker }) => {
            const started = new ReferenceWorker()
            started.onmessage = ({ data: { id, value, error } }: MessageEvent<ReferenceWorkerAnswer>) => {
              const request = pending.get(id)
              pending.delete(id)
              if (error === undefined) request?.resolve(value)
              else request?.reject(new Error(error))
            }
            started.onerror = () => {
              started.terminate()
              worker = Promise.resolve(null)
              const stranded = [...pending.values()]
              pending.clear()
              for (const request of stranded) request.inPage()
            }
            return started
          },
          () => null,
        )
  return worker
}

/**
 * One saved query from a downloaded part, decoded in a worker so a page that opens on a tap never parses a whole
 * part; only the query's own data crosses back.
 */
export async function readSavedQuery(asset: string, key: readonly unknown[], network: boolean): Promise<unknown> {
  const json = JSON.stringify(key)
  const reader = await referenceWorker()
  if (!reader) return decodeInPage(asset, json, network)
  return new Promise((resolve, reject) => {
    const id = ++requests
    pending.set(id, { resolve, reject, inPage: () => decodeInPage(asset, json, network).then(resolve, reject) })
    reader.postMessage({ id, asset: new URL(asset, location.href).href, key: json, network } satisfies ReferenceWorkerRequest)
  })
}
