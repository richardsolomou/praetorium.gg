import fs from 'node:fs'
import path from 'node:path'
import { terrainFromDatacards } from '../src/server/datacardTerrain'
import { readMissionPacks } from '../src/server/missionPacks'

const directory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
const layouts = terrainFromDatacards(
  readMissionPacks(path.join(directory, 'datacards', '11th', 'gdc')),
  path.join(directory, 'battlemaster'),
).terrainLayouts
const available = layouts.filter((layout) => layout.geometry).length
const labelled = layouts.filter((layout) => layout.geometry?.areas.some((area) => area.markers.length)).length
const labels = ['AB', 'CD', 'EF', 'GH']
const unbalanced = layouts.flatMap((layout) => {
  if (!layout.geometry) return []
  const markers = layout.geometry.areas.flatMap((area) => area.markers)
  if (!markers.length || labels.every((label) => markers.filter((marker) => marker.label === label).length === 2)) return []
  return [layout.id]
})

console.log(`terrain geometry: ${available}/${layouts.length} layouts`)
console.log(`terrain marker labels: ${labelled}/${layouts.length} layouts`)
if (!available) throw new Error('no terrain layout has exact geometry')
if (fs.existsSync(path.join(directory, 'battlemaster', 'terrain-labels.json')) && labelled !== available)
  throw new Error('source-pinned terrain label corrections are incomplete')
if (unbalanced.length) throw new Error(`terrain layouts have unbalanced reference markers: ${unbalanced.join(', ')}`)
