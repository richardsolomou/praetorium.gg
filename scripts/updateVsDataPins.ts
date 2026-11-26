// Pins each rules version's summaries in catalogue/sources.json to VS Data's newest release of it, by the digest GitHub
// records for the asset. Prints the releases it moved as a Markdown list, and nothing when every pin is current.
import fs from 'node:fs'
import { z } from 'zod'

const SOURCES = 'catalogue/sources.json'
const pinSchema = z.looseObject({ release: z.string(), asset: z.string(), revision: z.string() })
const sourcesSchema = z.looseObject({ summaries: pinSchema.extend({ repository: z.string(), earlier: z.array(pinSchema) }) })
const releaseSchema = z.object({
  tag_name: z.string(),
  draft: z.boolean(),
  assets: z.array(z.object({ name: z.string(), digest: z.string().nullable() })),
})
type Pin = z.infer<typeof pinSchema>

const token = process.env.GITHUB_TOKEN
// Validated, but written back as read, so the file keeps its key order.
const sources = JSON.parse(fs.readFileSync(SOURCES, 'utf8')) as z.infer<typeof sourcesSchema>
sourcesSchema.parse(sources)
const { repository } = sources.summaries

async function releases() {
  const all: z.infer<typeof releaseSchema>[] = []
  for (let page = 1; ; page++) {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`, {
      headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    })
    if (!response.ok) throw new Error(`GitHub releases: ${response.status}`)
    const batch = z.array(releaseSchema).parse(await response.json())
    all.push(...batch.filter((release) => !release.draft))
    if (batch.length < 100) return all
  }
}

const version = (tag: string) =>
  tag
    .slice(tag.lastIndexOf('-v') + 2)
    .split('.')
    .map(Number)
const newer = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  return false
}

const published = await releases()
const moved: string[] = []
const update = (pin: Pin) => {
  const prefix = pin.release.slice(0, pin.release.lastIndexOf('-v') + 2)
  const latest = published
    .filter((release) => release.tag_name.startsWith(prefix) && /^\d+\.\d+\.\d+$/.test(release.tag_name.slice(prefix.length)))
    .reduce<(typeof published)[number] | null>(
      (best, release) => (!best || newer(version(release.tag_name), version(best.tag_name)) ? release : best),
      null,
    )
  if (!latest || !newer(version(latest.tag_name), version(pin.release))) return
  // An asset is named after its release's version, as `vs-data-mfm-1-6-rule-summaries-v0.17.6.tar`.
  const assetName = pin.asset.replace(/-v\d+\.\d+\.\d+\.tar$/, `-v${latest.tag_name.slice(prefix.length)}.tar`)
  const digest = latest.assets.find((asset) => asset.name === assetName)?.digest
  if (!digest?.startsWith('sha256:')) throw new Error(`${latest.tag_name} has no digest for ${assetName}`)
  moved.push(`- ${pin.release} -> ${latest.tag_name}`)
  Object.assign(pin, { release: latest.tag_name, asset: assetName, revision: digest.slice('sha256:'.length) })
}
update(sources.summaries)
sources.summaries.earlier.forEach(update)

if (moved.length) fs.writeFileSync(SOURCES, `${JSON.stringify(sources, null, 2)}\n`)
for (const line of moved) console.log(line)
