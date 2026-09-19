import path from 'node:path'
import { loadTerrainLayouts } from '../src/server/rulesTerrain'

const directory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
const layouts = loadTerrainLayouts(path.join(directory, 'rules', 'data', 'core'), path.join(directory, 'battlemaster'))
const available = layouts.filter((layout) => layout.geometry).length
const labels = ['AB', 'CD', 'EF', 'GH']
const unbalanced = layouts.flatMap((layout) => {
  if (!layout.geometry) return []
  const markers = layout.geometry.areas.flatMap((area) => area.markers)
  if (!markers.length || labels.every((label) => markers.filter((marker) => marker.label === label).length === 2)) return []
  return [layout.id]
})

console.log(`terrain geometry: ${available}/${layouts.length} layouts`)
if (!available) throw new Error('no terrain layout has exact geometry')
if (unbalanced.length) throw new Error(`terrain layouts have unbalanced reference markers: ${unbalanced.join(', ')}`)
