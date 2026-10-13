import fs from 'node:fs'
import { assertMatchingProjections } from './lib/catalogueProjections'

const [source, runtime] = process.argv.slice(2)
if (!source || !runtime) throw new Error('usage: verifyCatalogueProjections <source.jsonl> <runtime.jsonl>')
assertMatchingProjections(fs.readFileSync(source, 'utf8'), fs.readFileSync(runtime, 'utf8'))
console.log('Source and runtime projection hashes match')
