export type Point = { x: number; y: number }

export type TerrainPiece = {
  id: string
  name: string
  type: string
  templateId: string
  position: Point
  rotation: number
  mirror: string | null
  parentAreaId: string | null
}

export type TerrainGeometry = {
  areas: {
    id: string
    name: string
    points: Point[]
    markers: { label: string; position: Point }[]
    objective: { position: Point; group: string | null } | null
    objectiveGroup: string | null
    measurements: { from: Point; to: Point }[]
    parts: {
      id: string
      name: string
      material: string
      roof: Point[] | null
      walls: { id: string; points: Point[]; thickness: number }[]
    }[]
  }[]
}

export type Deployment = {
  id: string
  name: string
  description: string | null
  zones: { player: string; name: string; colour: string; points: Point[] }[]
  objectives: Point[]
}

export type TerrainLayout = {
  id: string
  name: string
  description: string | null
  matchupId: string
  variant: number | null
  deploymentId: string | null
  pieces: TerrainPiece[]
  geometry: TerrainGeometry | null
}

export type TerrainTemplate = {
  id: string
  name: string
  kind: string
  points: Point[]
  features: { id: string; templateId: string; position: Point; rotation: number; mirror: string | null }[]
}
