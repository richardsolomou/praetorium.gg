import path from 'node:path'
import { loadTerrainLayouts } from '../src/server/rulesTerrain'

const directory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
const layouts = loadTerrainLayouts(path.join(directory, 'rules', 'data', 'core'), path.join(directory, 'battlemaster'))
const available = layouts.filter((layout) => layout.geometry).length

console.log(`terrain geometry: ${available}/${layouts.length} layouts`)
if (!available) throw new Error('no terrain layout has exact geometry')
