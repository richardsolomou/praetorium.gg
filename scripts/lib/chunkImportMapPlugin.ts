import type { Plugin } from 'vite'

const ID = 'virtual:chunk-import-map'

/**
 * Hands the client build's chunk import map to the server bundle, which writes it into every page. The client bundle
 * reads it as undefined: it cannot contain the map that names its own files.
 */
export function chunkImportMapPlugin(): Plugin {
  let importMap: string | undefined
  return {
    name: 'chunk-import-map',
    resolveId: (id) => (id === ID ? `\0${ID}` : undefined),
    load(id) {
      if (id !== `\0${ID}`) return
      const { consumer, command } = this.environment.config
      const server = consumer === 'server' && command === 'build'
      if (server && !importMap) throw new Error('Client chunk import map missing')
      return `export default ${JSON.stringify(server ? importMap : undefined)}`
    },
    // Read once written, after Vite's CSS plugin has added the stylesheets' entries.
    writeBundle(_options, bundle) {
      if (this.environment.name !== 'client') return
      const asset = bundle['importmap.json']
      if (asset?.type !== 'asset') throw new Error('Client chunk import map missing')
      importMap = String(asset.source)
    },
  }
}
