import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'
import { rosterTelemetryProperties } from '../src/shared/rosterTelemetry'
import { constructionDetachment } from '../src/shared/datacards'
import { detachmentReference } from '../src/shared/detachmentReference'
import { isReferenceDetachment } from '../src/shared/factionReferences'
import { hasDetachmentSemantics } from '../src/shared/rules'
import { routeSlug } from '../src/core/slug'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
describe.skipIf(!fs.existsSync(directory))('Genestealer Cults detachment source identities', () => {
  let source: ReturnType<typeof loadSnapshotWithRules>
  beforeAll(() => {
    source = loadSnapshotWithRules(path.resolve(directory))
  }, 30_000)

  const cults = () => source.catalogue.factions.find((faction) => routeSlug(faction.name) === 'genestealer-cults')!
  const auxilia = () =>
    source.catalogue.detachments.get(cults().id)!.options.find((option) => /brood brothers? auxilia/i.test(option.name))!

  it('resolves both detachments from the reported production combination', () => {
    const options = source.catalogue.detachments.get(cults().id)!.options
    const ids = [auxilia().id, options.find((option) => option.name === 'Xenocult Masses')!.id]
    expect(
      rosterTelemetryProperties({ catalogueId: cults().id, detachmentIds: ids, limit: 2_000 }, source.catalogue, source.rules),
    ).toMatchObject({ detachment_rules_covered: true })
  })

  it('joins the rules, stratagems and enhancement descriptions without copying source prose', () => {
    const reference = detachmentReference(source.catalogue, source.rules, cults().id, routeSlug(auxilia().name))!
    expect({
      rules: reference.rules.length,
      stratagems: reference.stratagems.length,
      enhancements: reference.enhancements.filter((entry) => entry.description).length,
      points: reference.points,
    }).toEqual({ rules: 2, stratagems: 6, enhancements: 4, points: 2 })
  })

  it('uses the same identity for construction and supported semantics', () => {
    const candidate = { faction: 'Genestealer Cults', name: auxilia().name }
    expect({
      construction: constructionDetachment(source.catalogue.datacards, candidate.faction, candidate.name),
      supported: hasDetachmentSemantics(source.rules, candidate),
      reference: isReferenceDetachment(source.catalogue, source.rules, cults(), auxilia()),
    }).toEqual({ construction: { points: 2, dispositions: ['take-and-hold'] }, supported: true, reference: true })
  })
})
