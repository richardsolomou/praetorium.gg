import { z } from 'zod'
import { fromBase64Url, toBase64Url } from './base64'
import {
  customPointsBudget,
  FORMAT_RULE_IDS,
  DETACHMENTS_MAX,
  OPTIONAL_RULE_IDS,
  POINTS_BUDGET_MAX,
  POINTS_BUDGET_MIN,
  pointsBudgetError,
  ROSTER_NAME_MAX_LENGTH,
} from './battle'
import { detachmentIdSchema, idSchema as id, rosterLimitSchema, rosterPickSchema } from './commands'
import { currentRosterIds } from './retiredCatalogueIds'
import type { RosterPick } from './roster'
import { withoutUnitNotes } from './unitNotes'

/** Format 2 adds a custom points budget, so a code without one stays format 1 and older apps still read it. */
const ROSTER_EXCHANGE_VERSION = 2
const ROSTER_EXCHANGE_BUDGET_VERSION = 2
/** Longer codes are refused before decompression; QR codes hold far less. */
export const ROSTER_EXCHANGE_MAX_CODE_LENGTH = 12_000
/** Longer links make QR codes too dense for a phone camera to read from another screen. */
export const ROSTER_EXCHANGE_QR_MAX_LENGTH = 2_000
const MAX_PAYLOAD_BYTES = 100_000
const MAX_PICKS = 100
const PREFIX = 'PR'
const CODE = /^(?:https?:\/\/[^\s#]+#code=)?PR(\d{1,4})\.(\S*)$/
const BASE64URL = /^[A-Za-z0-9_-]+$/

const payloadSchema = z.object({
  name: z.string().max(ROSTER_NAME_MAX_LENGTH),
  catalogueId: id,
  detachmentIds: z.array(detachmentIdSchema).max(DETACHMENTS_MAX),
  disposition: id.nullable(),
  borrowedDetachmentId: detachmentIdSchema.nullable(),
  limit: rosterLimitSchema,
  pointsBudget: z.number().int().min(POINTS_BUDGET_MIN).max(POINTS_BUDGET_MAX).optional(),
  /** What the sender's copy priced at, shown beside today's price rather than trusted. */
  points: z.number().int().min(0).max(100_000).nullable(),
  waivedRules: z.array(z.enum(FORMAT_RULE_IDS)).max(FORMAT_RULE_IDS.length),
  optionalRules: z.array(z.enum(OPTIONAL_RULE_IDS)).max(OPTIONAL_RULE_IDS.length),
  picks: z.array(rosterPickSchema).max(MAX_PICKS),
})
const exchangeSchema = payloadSchema.refine((payload) => !pointsBudgetError(payload.limit, payload.pointsBudget))

/** A roster's contents, unit nicknames and rules identity; owner, visibility, preparation, reminders and unit notes are never part of it. */
export type RosterExchange = z.infer<typeof payloadSchema>

export type RosterExchangeProblem = 'malformed' | 'oversized' | 'unsupported-version'

export class RosterExchangeError extends Error {
  constructor(
    readonly problem: RosterExchangeProblem,
    message: string,
  ) {
    super(message)
  }
}

export const ROSTER_EXCHANGE_RULES_UNAVAILABLE =
  'This roster uses a rules version that is not available here. Ask the sender to convert it to a current rules version, or to send army text instead.'

const malformed = () =>
  new RosterExchangeError('malformed', 'This exchange code is incomplete or damaged. Copy the whole code again or scan its QR code.')

export async function encodeRosterExchange(roster: {
  name: string
  catalogueId: string
  detachmentIds: readonly string[]
  disposition: string | null
  borrowedDetachmentId?: string | null
  limit: number
  pointsBudget?: number | null
  points?: number | null
  waivedRules?: readonly string[]
  optionalRules?: readonly string[]
  picks: readonly RosterPick[]
}) {
  const pointsBudget = customPointsBudget(roster.limit, roster.pointsBudget)
  const payload = exchangeSchema.parse({
    name: roster.name,
    catalogueId: roster.catalogueId,
    detachmentIds: roster.detachmentIds,
    disposition: roster.disposition,
    borrowedDetachmentId: roster.borrowedDetachmentId ?? null,
    limit: roster.limit,
    ...(pointsBudget === null ? {} : { pointsBudget }),
    points: roster.points ?? null,
    waivedRules: roster.waivedRules ?? [],
    optionalRules: roster.optionalRules ?? [],
    picks: withoutUnitNotes(roster.picks),
  })
  const compressed = await transform(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream('deflate-raw'))
  return `${PREFIX}${pointsBudget === null ? 1 : ROSTER_EXCHANGE_BUDGET_VERSION}.${toBase64Url(compressed)}`
}

/** The import page link a QR code carries; the fragment keeps the roster out of server logs. */
export const rosterExchangeLink = (origin: string, code: string) => `${origin}/rosters#code=${code}`

/** Whether pasted text is meant as an exchange code, either bare or inside its import link. */
export const isRosterExchangeCode = (text: string) => CODE.test(text.trim())

export async function decodeRosterExchange(text: string): Promise<RosterExchange> {
  const trimmed = text.trim()
  if (trimmed.length > ROSTER_EXCHANGE_MAX_CODE_LENGTH + 200)
    throw new RosterExchangeError(
      'oversized',
      `This exchange code is longer than ${ROSTER_EXCHANGE_MAX_CODE_LENGTH.toLocaleString('en')} characters, the most a roster code can be.`,
    )
  const match = CODE.exec(trimmed)
  if (!match) throw malformed()
  const version = Number(match[1])
  if (version < 1 || version > ROSTER_EXCHANGE_VERSION)
    throw new RosterExchangeError(
      'unsupported-version',
      version > ROSTER_EXCHANGE_VERSION
        ? `This exchange code uses format ${version}, which this version of Praetorium cannot read. Refresh or update the app and try again.`
        : `This exchange code uses format ${version}, which Praetorium no longer reads. Ask for a new code.`,
    )
  const body = match[2]!
  if (body.length > ROSTER_EXCHANGE_MAX_CODE_LENGTH)
    throw new RosterExchangeError(
      'oversized',
      `This exchange code is longer than ${ROSTER_EXCHANGE_MAX_CODE_LENGTH.toLocaleString('en')} characters, the most a roster code can be.`,
    )
  if (!BASE64URL.test(body)) throw malformed()
  let raw: unknown
  try {
    const bytes = await transform(fromBase64Url(body), new DecompressionStream('deflate-raw'), MAX_PAYLOAD_BYTES)
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (error) {
    if (error instanceof RosterExchangeError) throw error
    throw malformed()
  }
  if (raw && typeof raw === 'object' && 'picks' in raw && Array.isArray(raw.picks) && raw.picks.length > MAX_PICKS)
    throw new RosterExchangeError(
      'oversized',
      `This exchange code holds ${raw.picks.length} entries; a roster can contain at most ${MAX_PICKS}.`,
    )
  const parsed = exchangeSchema.safeParse(raw)
  if (!parsed.success) throw malformed()
  return currentRosterIds(parsed.data)
}

async function transform(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream, limit = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit)
        throw new RosterExchangeError(
          'oversized',
          `This exchange code expands beyond ${Math.round(limit / 1000)} KB, more than any roster holds.`,
        )
      parts.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const joined = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    joined.set(part, offset)
    offset += part.byteLength
  }
  return joined
}
