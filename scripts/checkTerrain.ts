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

const objectiveSources = path.join(directory, 'battlemaster', 'layouts')
if (fs.existsSync(objectiveSources) && fs.readdirSync(objectiveSources).some((file) => file.endsWith('.lite.json'))) {
  const catalog = JSON.parse(fs.readFileSync(path.join(directory, 'battlemaster', 'catalog.json'), 'utf8')) as {
    layouts: { id: string }[]
  }
  if (catalog.layouts.some(({ id }) => !fs.existsSync(path.join(objectiveSources, `${id}.lite.json`))))
    throw new Error('layout-specific objective sources are incomplete')
  const objectiveLayouts = layouts.filter((layout) => layout.geometry?.areas.some((area) => area.objective)).length
  console.log(`layout-specific objectives: ${objectiveLayouts}/${available} layouts`)
  if (objectiveLayouts !== available) throw new Error('terrain layouts have missing source objectives')
}

console.log(`terrain geometry: ${available}/${layouts.length} layouts`)
console.log(`terrain marker labels: ${labelled}/${layouts.length} layouts`)
if (!available) throw new Error('no terrain layout has exact geometry')
if (fs.existsSync(path.join(directory, 'battlemaster', 'terrain-labels.json')) && labelled !== available)
  throw new Error('source-pinned terrain label corrections are incomplete')
if (unbalanced.length) throw new Error(`terrain layouts have unbalanced reference markers: ${unbalanced.join(', ')}`)
