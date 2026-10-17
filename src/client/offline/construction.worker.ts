import { bundleAt } from './download'
import { buildConstruction, constructionSource, runConstructionRead } from './constructionSource'
import type { ConstructionReadName } from './constructionReads'
import type { OfflineConstructionData, OfflineConstructionSource } from '../../contracts/offlineReference'
import { pickerConstruction } from '../../shared/pickerUnits'

export type ConstructionWorkerRequest =
  | { kind: 'read'; id: number; url: string; name: ConstructionReadName; data: unknown; catalogueId?: string }
  | { kind: 'prepare'; url: string; catalogueId?: string; units: boolean; keys: string[] }
export type ConstructionWorkerAnswer =
  | { id: number; value: unknown }
  | { id: number; error: string }
  | { prepared: string[] }
  | { unprepared: string[] }
  | { unavailable: string }

let download: Promise<OfflineConstructionData> | undefined
const built = new WeakMap<OfflineConstructionSource, ReturnType<typeof buildConstruction>>()

class Unavailable extends Error {}

const post = (answer: ConstructionWorkerAnswer) => self.postMessage(answer)

async function construction(url: string, catalogueId?: string) {
  download ??= bundleAt(url, new AbortController().signal).then((bundle) => {
    if (!bundle.construction) throw new Error('The construction bundle is invalid')
    return bundle.construction
  })
  const source = await download.catch((error: unknown) => {
    throw new Unavailable(String(error))
  })
  const saved = constructionSource(source, catalogueId)
  if (!saved) throw new Error('This rules version is not in the download')
  let prepared = built.get(saved)
  if (!prepared) built.set(saved, (prepared = buildConstruction(saved)))
  return prepared
}

const failed = (error: unknown) => {
  if (error instanceof Unavailable) post({ unavailable: error.message })
}

/** Builds a rules version's construction data and, for `units`, prepares a faction's picker a datasheet per step. */
async function prepare({ url, catalogueId, units, keys }: Extract<ConstructionWorkerRequest, { kind: 'prepare' }>) {
  try {
    const { catalogue, rules } = await construction(url, catalogueId)
    if (units && catalogueId) {
      const steps = pickerConstruction(catalogue, rules, catalogueId)
      // Yielding between datasheets lets reads that are already prepared be answered meanwhile.
      while (!steps.next().done) await new Promise((resolve) => setTimeout(resolve))
    }
    post({ prepared: keys })
  } catch (error) {
    post({ unprepared: keys })
    failed(error)
  }
}

self.onmessage = async ({ data: request }: MessageEvent<ConstructionWorkerRequest>) => {
  if (request.kind === 'prepare') return prepare(request)
  try {
    post({
      id: request.id,
      value: runConstructionRead(request.name, await construction(request.url, request.catalogueId), request.data as never),
    })
  } catch (error) {
    failed(error)
    post({ id: request.id, error: String(error) })
  }
}
