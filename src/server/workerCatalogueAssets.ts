type Assets = { fetch: (request: string) => Promise<Response> }

export async function readWorkerCatalogueAsset(assets: Assets, key: string, maxBytes: number) {
  const response = await assets.fetch(`https://assets.local/_catalogue/${key}`)
  if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) {
    throw new Error('Worker catalogue asset unavailable')
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > maxBytes) throw new Error('Worker catalogue asset unavailable')
  return bytes
}
