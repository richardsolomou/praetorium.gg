import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { parseImageDataUrl } from './privateImages'
import { reportServerFailure } from '../adapters/posthog'

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
/** Pinned, so probabilities stay comparable across uploads while thresholds are chosen from them. */
const MODEL = 'jev-1.14.0'

/** Collection photos must show miniatures; sculpted or painted content is ruled out where generic filters would flag it. */
export const COLLECTION_PHOTO_QUESTIONS = {
  miniatures: 'Is `photo` a photograph of tabletop wargaming miniatures, models, terrain, or their painting and assembly?',
  nudity:
    'Does `photo` show nudity or sexual content involving real people, or explicit sexual imagery? Sculpted or painted miniatures do not count.',
  real_gore:
    'Does `photo` show real blood, injury or death of real people or animals? Gore sculpted or painted on miniatures does not count.',
  hate_symbols:
    'Does `photo` display a real-world hate symbol, such as a swastika or a white-power emblem? Fictional Warhammer iconography does not count.',
  personal_info:
    'Does `photo` show a real person’s face, or readable personal information such as an address, a phone number or an identity document?',
}

/** A profile picture can show anything short of seriously inappropriate content. */
export const PROFILE_PICTURE_QUESTIONS = {
  nudity: 'Does `photo` show nudity, whether photographed, drawn, rendered or sculpted?',
  sexually_explicit:
    'Is `photo` sexually explicit, such as pornography or a sexual act? Nudity in classical art or statues does not count.',
  graphic_violence: 'Does `photo` show graphic real-world violence, gore or death? Fictional, game or Warhammer artwork does not count.',
  hate_symbols:
    'Does `photo` display a real-world hate symbol, such as a swastika or a white-power emblem? Fictional Warhammer iconography does not count.',
}

/** Asks TypeSafe's Jev about an uploaded image; images are an experimental TypeSafe feature turned on per request. */
export function photoScreening(apiKey: string, fetcher: typeof fetch = fetch) {
  return {
    /** The probability of yes to each question, or null for a format the model cannot read. */
    async screen<Id extends string>(image: string, questions: Record<Id, string>) {
      const readable = parseImageDataUrl(image, ['jpeg', 'png'])
      if (!readable) return null
      const ids = Object.keys(questions) as [Id, ...Id[]]
      const reference = randomUUID()
      const answer = await fetcher(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'typesafe-danger-zone-images': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          state: { photo: reference },
          assets: {
            [reference]: {
              type: 'image',
              format: readable.format === 'png' ? 'png' : 'jpg',
              data_base64: readable.bytes.toString('base64'),
            },
          },
          questions: Object.fromEntries(ids.map((id) => [id, { type: 'noul', instructions: questions[id] }])),
        }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!answer.ok) throw new Error(`TypeSafe screening failed with HTTP ${answer.status}`)
      const { model, answers } = z
        .object({ model: z.string(), answers: z.record(z.enum(ids), z.object({ noul: z.number().min(0).max(1) })) })
        .parse(await answer.json())
      return { model, probabilities: Object.fromEntries(ids.map((id) => [id, answers[id].noul])) }
    },
  }
}

export type PhotoScreening = ReturnType<typeof photoScreening>

/**
 * Screens an upload and hands the outcome to `record`, for choosing thresholds from real uploads; nothing is held or
 * refused on it yet. Never rejects, because the upload it describes has already succeeded.
 */
export async function recordScreening(
  screening: PhotoScreening | null,
  image: string,
  questions: Record<string, string>,
  record: (properties: Record<string, string | number>) => Promise<unknown>,
) {
  if (!screening) return
  const properties = await screening.screen(image, questions).then(
    (result): Record<string, string | number> =>
      result ? { outcome: 'screened', model: result.model, ...result.probabilities } : { outcome: 'unreadable' },
    (error: unknown) => {
      reportServerFailure({ event: 'image_screening_failed', error })
      return { outcome: 'failed' }
    },
  )
  await record(properties).catch(() => undefined)
}
