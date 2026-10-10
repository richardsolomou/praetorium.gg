import { z } from 'zod'

const slotSchema = z.object({ archetypeA: z.string(), archetypeB: z.string(), slotIndex: z.number().int().min(1).max(3) })
const objectiveCode = z.enum(['c', 'c1', 'c2', 'n', 'hb', 'hr', 'hl', 'ht'])
const finite = z.number()
const liteSchema = z.object({
  format: z.literal('battlemaster.tts.chapter-approved-layout-lite'),
  layout: z.object({
    id: z.string(),
    chapterApprovedSlot: slotSchema,
    chapterApprovedDeploymentKey: z.number().int(),
  }),
  litePayload: z.object({
    v: z.literal(1),
    k: z.literal('bml'),
    id: z.string(),
    b: z.literal('sf60x44'),
    a: z.literal('c'),
    s: z.tuple([z.string(), z.string(), z.number().int(), z.number().int()]),
    i: z
      .array(
        z.tuple([
          z.number().int().nonnegative(),
          finite,
          finite,
          finite,
          z.number().int().min(0).max(3).optional(),
          objectiveCode.optional(),
        ]),
      )
      .max(128),
  }),
})

const detailSchema = z.object({
  layout: z.object({ chapterApprovedSlot: slotSchema, chapterApprovedDeploymentKey: z.number().int() }),
  terrain: z
    .array(
      z.object({
        footprint: z.object({
          origin: z.object({ x: finite, y: finite }),
          widthIn: finite.positive(),
          heightIn: finite.positive(),
          rotationDeg: finite,
        }),
      }),
    )
    .min(1)
    .max(128),
})

export function battlemasterObjectiveHosts(rawDetail: unknown, raw: unknown, id: string) {
  const detail = detailSchema.parse(rawDetail)
  const lite = liteSchema.parse(raw)
  const slot = detail.layout.chapterApprovedSlot
  const deployment = detail.layout.chapterApprovedDeploymentKey
  const identity = [slot.archetypeA, slot.archetypeB, slot.slotIndex, deployment].join('|')
  const liteSlot = lite.layout.chapterApprovedSlot
  if (
    lite.layout.id !== id ||
    lite.litePayload.id !== id ||
    identity !== lite.litePayload.s.join('|') ||
    identity !== [liteSlot.archetypeA, liteSlot.archetypeB, liteSlot.slotIndex, lite.layout.chapterApprovedDeploymentKey].join('|') ||
    lite.litePayload.i.length !== detail.terrain.length
  )
    throw new Error(`objective layout identity does not match ${id}`)

  return lite.litePayload.i.map((instance, index) => {
    const [, x, y, rotation, , code] = instance
    const footprint = detail.terrain[index]!.footprint
    const radians = (footprint.rotationDeg * Math.PI) / 180
    const centre = {
      x: footprint.origin.x + (footprint.widthIn / 2) * Math.cos(radians) - (footprint.heightIn / 2) * Math.sin(radians),
      y: footprint.origin.y + (footprint.widthIn / 2) * Math.sin(radians) + (footprint.heightIn / 2) * Math.cos(radians),
    }
    const rotationDifference = (((rotation - footprint.rotationDeg) % 360) + 360) % 360
    if (Math.hypot(x - centre.x, y - centre.y) > 0.01 || Math.min(rotationDifference, 360 - rotationDifference) > 0.01) {
      throw new Error(`objective terrain ${index + 1} does not match ${id}`)
    }
    return code ? { position: { x: x + 30, y: 22 - y }, group: code === 'c1' || code === 'c2' ? 'center' : null } : null
  })
}
