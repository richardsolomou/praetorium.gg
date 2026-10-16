import { describe, expect, it } from 'vitest'
import { COLLECTION_PHOTO_QUESTIONS, PROFILE_PICTURE_QUESTIONS, photoScreening, recordScreening } from './photoScreening'

const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64')}`
const WEBP = 'data:image/webp;base64,UklGRg=='

function answering(status: number, answers: Record<string, unknown> = {}) {
  const requests: RequestInit[] = []
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push(init!)
    return Response.json({ model: 'jev-1.14.0', answers, usage: { input_tokens: 1, output_tokens: 1 } }, { status })
  }
  return { requests, fetch }
}

const nouls = (questions: Record<string, string>, value: number) =>
  Object.fromEntries(Object.keys(questions).map((id) => [id, { type: 'noul', noul: value }]))

describe('photoScreening', () => {
  it('returns one probability per question', async () => {
    const { fetch } = answering(200, nouls(COLLECTION_PHOTO_QUESTIONS, 0.25))
    expect(await photoScreening('key', fetch).screen(JPEG, COLLECTION_PHOTO_QUESTIONS)).toEqual({
      model: 'jev-1.14.0',
      probabilities: Object.fromEntries(Object.keys(COLLECTION_PHOTO_QUESTIONS).map((id) => [id, 0.25])),
    })
  })

  it('sends the photo as an image asset with images turned on', async () => {
    const { requests, fetch } = answering(200, nouls(COLLECTION_PHOTO_QUESTIONS, 0))
    await photoScreening('key', fetch).screen(JPEG, COLLECTION_PHOTO_QUESTIONS)
    const body = JSON.parse(requests[0]!.body as string)
    expect([
      new Headers(requests[0]!.headers).get('typesafe-danger-zone-images'),
      body.assets[body.state.photo].format,
      body.assets[body.state.photo].data_base64,
    ]).toEqual(['true', 'jpg', JPEG.split(',')[1]])
  })

  it('asks only the questions it is given', async () => {
    const { requests, fetch } = answering(200, nouls(PROFILE_PICTURE_QUESTIONS, 0))
    await photoScreening('key', fetch).screen(JPEG, PROFILE_PICTURE_QUESTIONS)
    expect(Object.keys(JSON.parse(requests[0]!.body as string).questions)).toEqual(Object.keys(PROFILE_PICTURE_QUESTIONS))
  })

  it('skips a format the model cannot read without calling it', async () => {
    const { requests, fetch } = answering(200)
    expect([await photoScreening('key', fetch).screen(WEBP, COLLECTION_PHOTO_QUESTIONS), requests.length]).toEqual([null, 0])
  })

  it('fails when an answer is missing rather than reading it as no', async () => {
    const { miniatures: _, ...rest } = nouls(COLLECTION_PHOTO_QUESTIONS, 0)
    const { fetch } = answering(200, rest)
    await expect(photoScreening('key', fetch).screen(JPEG, COLLECTION_PHOTO_QUESTIONS)).rejects.toThrow()
  })

  it('fails with the status when the model refuses the photo', async () => {
    const { fetch } = answering(400)
    await expect(photoScreening('key', fetch).screen(JPEG, COLLECTION_PHOTO_QUESTIONS)).rejects.toThrow('HTTP 400')
  })
})

describe('recordScreening', () => {
  const recorded = async (status: number, image: string) => {
    const records: Record<string, string | number>[] = []
    const { fetch } = answering(status, nouls(PROFILE_PICTURE_QUESTIONS, 0.5))
    await recordScreening(photoScreening('key', fetch), image, PROFILE_PICTURE_QUESTIONS, async (properties) => records.push(properties))
    return records
  }

  it('records the probabilities of a screened image', async () => {
    expect(await recorded(200, JPEG)).toEqual([
      {
        outcome: 'screened',
        model: 'jev-1.14.0',
        nudity: 0.5,
        sexually_explicit: 0.5,
        graphic_violence: 0.5,
        hate_symbols: 0.5,
      },
    ])
  })

  it('records an image the model cannot read', async () => {
    expect(await recorded(200, WEBP)).toEqual([{ outcome: 'unreadable' }])
  })

  it('records a failed screening instead of rejecting', async () => {
    expect(await recorded(500, JPEG)).toEqual([{ outcome: 'failed' }])
  })

  it('records nothing without a screening key', async () => {
    const records: unknown[] = []
    await recordScreening(null, JPEG, PROFILE_PICTURE_QUESTIONS, async (properties) => records.push(properties))
    expect(records).toEqual([])
  })
})
