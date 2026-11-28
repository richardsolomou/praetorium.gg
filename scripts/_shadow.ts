// One-off: Shadowkeepers' rule cards and what joins each. Ids only.
import path from 'node:path'
import { detachmentReference } from '../src/shared/detachmentReference'
import { factionsFor } from '../src/shared/factionReferences'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const { catalogue, rules } = loadSnapshotWithRules(path.resolve(catalogueDataDirectory()))
const faction = factionsFor(catalogue, rules).factions.find((f) => f.slug === 'adeptus-custodes')!
for (const slug of ['shadowkeepers', 'might-of-the-moritoi', 'lions-of-the-emperor']) {
  const detail = detachmentReference(catalogue, rules, faction.id, slug)
  console.log(slug, JSON.stringify(detail?.rules.map((r: any) => ({ name: r.name, vsDataId: r.vsDataId, bsdataId: r.bsdataId, catalogueOnly: !r.vsDataId && !!r.bsdataId }))))
}
