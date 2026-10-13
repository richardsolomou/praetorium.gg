import './installCatalogueAuthoring'

const script = process.argv[2]
if (!script || !/^[a-zA-Z]+\.ts$/.test(script)) throw new Error('Expected a catalogue script filename')
process.argv.splice(2, 1)
await import(new URL(script, import.meta.url).href)
