import { REFERENCE_KINDS, type ReferenceKind } from '../contracts/reference'
import { REFERENCE_QUERY_MAX_LENGTH, REFERENCE_RESULT_MAX } from './referenceSearch'

export function referenceOpenApi(request: Request) {
  const origin = new URL(request.url).origin
  return {
    openapi: '3.1.0',
    info: {
      title: 'Praetorium game reference API',
      version: '1.0.0',
      description: 'Read-only search and retrieval for the verified Warhammer 40,000 community reference used by Praetorium.',
    },
    servers: [{ url: origin }],
    paths: {
      '/api/reference/v1/about': {
        get: {
          operationId: 'getPraetoriumGuide',
          summary: 'Describe Praetorium and the agent workflow',
          responses: responseSchemas('Praetorium guide', schemaRef('ProductGuide')),
        },
      },
      '/api/reference/v1/': {
        get: {
          operationId: 'getReferenceIndex',
          summary: 'List reference kinds, factions, mission packs, rule documents, and revisions',
          responses: responseSchemas('Reference index', schemaRef('ReferenceIndex')),
        },
      },
      '/api/reference/v1/search': {
        get: {
          operationId: 'searchReference',
          summary: 'Search missions, rules, detachments, and datasheets',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2, maxLength: REFERENCE_QUERY_MAX_LENGTH } },
            {
              name: 'kind',
              in: 'query',
              schema: { type: 'string', description: `Comma-separated ${REFERENCE_KINDS.join(', ')} filters.` },
            },
            { name: 'faction', in: 'query', schema: { type: 'string', maxLength: 160 } },
            { name: 'pack', in: 'query', schema: { type: 'string', maxLength: 160 } },
            { name: 'document', in: 'query', schema: { type: 'string', maxLength: 160 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: REFERENCE_RESULT_MAX, default: 10 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
          ],
          responses: responseSchemas('Search results', schemaRef('ReferenceSearchResponse')),
        },
      },
      '/api/reference/v1/factions': {
        get: {
          operationId: 'listFactions',
          summary: 'List factions in the reference',
          responses: responseSchemas('Faction index', schemaRef('FactionIndex')),
        },
      },
      '/api/reference/v1/factions/{catalogueId}/units': {
        get: {
          operationId: 'listFactionUnits',
          summary: 'List compact roster-planning unit summaries in one bounded read',
          parameters: [
            ...pathParameters('catalogueId'),
            { name: 'battleSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 10_000 } },
            { name: 'detachment', in: 'query', schema: { type: 'string', maxLength: 160 } },
          ],
          responses: responseSchemas('Faction units', schemaRef('UnitIndex')),
        },
      },
      '/api/reference/v1/datasheets/{catalogueId}/{slug}': {
        get: {
          operationId: 'getDatasheet',
          summary: 'Get one datasheet',
          parameters: pathParameters('catalogueId', 'slug'),
          responses: responseSchemas('Datasheet', schemaRef('DatasheetRecord')),
        },
      },
      '/api/reference/v1/detachments/{catalogueId}/{slug}': {
        get: {
          operationId: 'getDetachment',
          summary: 'Get one detachment',
          parameters: pathParameters('catalogueId', 'slug'),
          responses: responseSchemas('Detachment', schemaRef('DetachmentRecord')),
        },
      },
      '/api/reference/v1/rules/{documentId}/{sectionId}': {
        get: {
          operationId: 'getRuleSection',
          summary: 'Get one rules section',
          parameters: pathParameters('documentId', 'sectionId'),
          responses: responseSchemas('Rules section', schemaRef('RuleSectionRecord')),
        },
      },
      '/api/reference/v1/documents/{id}': {
        get: {
          operationId: 'getReferenceDocument',
          summary: 'Get one search result document',
          parameters: pathParameters('id'),
          responses: responseSchemas('Reference document', schemaRef('ReferenceDocument')),
        },
      },
      '/api/reference/v1/records/{id}': {
        get: {
          operationId: 'getReferenceRecord',
          summary: 'Get the structured record behind a reference document',
          parameters: pathParameters('id'),
          responses: responseSchemas('Structured reference record', schemaRef('ReferenceRecord')),
        },
      },
    },
    components: {
      schemas: {
        Error: objectSchema({ error: { type: 'string' } }, ['error']),
        Revisions: { type: 'object', additionalProperties: { type: 'string' } },
        Attribution: { type: 'array', items: { type: 'string' } },
        ProductGuide: objectSchema(
          {
            product: { type: 'string' },
            capabilities: stringArray(),
            boundaries: stringArray(),
            dataModel: stringArray(),
            agentWorkflow: stringArray(),
          },
          ['product', 'capabilities', 'boundaries', 'dataModel', 'agentWorkflow'],
        ),
        ReferenceDocumentSummary: objectSchema({ id: { type: 'string' }, title: { type: 'string' }, url: { type: 'string' } }, [
          'id',
          'title',
          'url',
        ]),
        FactionSummary: objectSchema(
          {
            id: { type: 'string' },
            slug: { type: 'string' },
            name: { type: 'string' },
            datasheets: { type: 'integer', minimum: 0 },
            detachments: { type: 'integer', minimum: 0 },
          },
          ['id', 'slug', 'name', 'datasheets', 'detachments'],
        ),
        ReferenceIndex: objectSchema(
          {
            corpusRevision: { type: 'string' },
            revisions: schemaRef('Revisions'),
            kinds: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
            factions: { type: 'array', items: schemaRef('FactionSummary') },
            missionPacks: { type: 'array', items: schemaRef('ReferenceDocumentSummary') },
            ruleDocuments: {
              type: 'array',
              items: objectSchema(
                {
                  id: { type: 'string' },
                  slug: { type: 'string' },
                  title: { type: 'string' },
                  sections: { type: 'integer', minimum: 0 },
                  url: { type: 'string' },
                },
                ['id', 'slug', 'title', 'sections', 'url'],
              ),
            },
          },
          ['corpusRevision', 'revisions', 'kinds', 'factions', 'missionPacks', 'ruleDocuments'],
        ),
        ReferenceSection: objectSchema(
          { id: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' }, url: { type: 'string' } },
          ['id', 'title', 'text', 'url'],
        ),
        ReferenceDocument: objectSchema(
          {
            id: { type: 'string' },
            kind: { type: 'string', enum: REFERENCE_KINDS },
            title: { type: 'string' },
            faction: { type: ['string', 'null'] },
            url: { type: 'string' },
            sections: { type: 'array', items: schemaRef('ReferenceSection') },
            revisions: schemaRef('Revisions'),
            attribution: schemaRef('Attribution'),
          },
          ['id', 'kind', 'title', 'faction', 'url', 'sections', 'revisions', 'attribution'],
        ),
        ReferenceSearchResult: objectSchema(
          {
            id: { type: 'string' },
            kind: { type: 'string', enum: REFERENCE_KINDS },
            title: { type: 'string' },
            faction: { type: ['string', 'null'] },
            url: { type: 'string' },
            section: objectSchema({ id: { type: 'string' }, title: { type: 'string' }, url: { type: 'string' } }, ['id', 'title', 'url']),
            excerpt: { type: 'string', maxLength: 322 },
            revisions: schemaRef('Revisions'),
            attribution: schemaRef('Attribution'),
          },
          ['id', 'kind', 'title', 'faction', 'url', 'section', 'excerpt', 'revisions', 'attribution'],
        ),
        ReferenceSearchResponse: objectSchema(
          {
            query: { type: 'string' },
            results: { type: 'array', maxItems: REFERENCE_RESULT_MAX, items: schemaRef('ReferenceSearchResult') },
            revisions: schemaRef('Revisions'),
            nextCursor: nullable({ type: 'string' }),
          },
          ['query', 'results', 'revisions', 'nextCursor'],
        ),
        FactionIndex: objectSchema(
          {
            factions: { type: 'array', items: schemaRef('FactionSummary') },
            revisions: schemaRef('Revisions'),
          },
          ['factions', 'revisions'],
        ),
        UnitSummary: objectSchema(
          {
            id: { type: 'string' },
            slug: { type: 'string' },
            name: { type: 'string' },
            group: { type: 'string' },
            allied: { type: 'boolean' },
            alliedFaction: nullable({ type: 'string' }),
            points: nullable({ type: 'number' }),
            limit: nullable({ type: 'integer', minimum: 0 }),
            keywords: stringArray(),
            composition: stringArray(),
            costs: {
              type: 'array',
              items: objectSchema(
                {
                  models: { type: 'string' },
                  cost: { type: 'string' },
                  keyword: nullable({ type: 'string' }),
                  faction: nullable({ type: 'string' }),
                  detachment: nullable({ type: 'string' }),
                },
                ['models', 'cost', 'keyword', 'faction', 'detachment'],
              ),
            },
            canLead: stringArray(),
            canSupport: stringArray(),
            canBeLedBy: stringArray(),
            canBeSupportedBy: stringArray(),
            url: nullable({ type: 'string' }),
            referenceId: nullable({ type: 'string' }),
          },
          [
            'id',
            'slug',
            'name',
            'group',
            'allied',
            'alliedFaction',
            'points',
            'limit',
            'keywords',
            'composition',
            'costs',
            'canLead',
            'canSupport',
            'canBeLedBy',
            'canBeSupportedBy',
            'url',
            'referenceId',
          ],
        ),
        UnitIndex: objectSchema(
          {
            faction: schemaRef('FactionSummary'),
            battleSize: nullable({ type: 'integer', minimum: 1 }),
            detachment: nullable(schemaRef('Detachment')),
            units: { type: 'array', items: schemaRef('UnitSummary') },
            revisions: schemaRef('Revisions'),
          },
          ['faction', 'battleSize', 'detachment', 'units', 'revisions'],
        ),
        ReferenceRecord: objectSchema(
          {
            document: schemaRef('ReferenceDocument'),
            data: { type: 'object', additionalProperties: true },
          },
          ['document', 'data'],
        ),
        CanonicalFieldResolution: objectSchema(
          {
            sources: { type: 'array', items: { type: 'string', enum: ['definitions', 'points', 'rules', 'datacards', 'battlemaster'] } },
            strategy: {
              type: 'string',
              enum: ['single-source', 'sources-agree', 'merged', 'source-priority', 'fallback', 'unresolved'],
            },
          },
          ['sources', 'strategy'],
        ),
        DatasheetProfile: objectSchema(
          {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string' },
            kind: { type: 'string', enum: ['unit', 'ranged-weapon', 'melee-weapon', 'transport', 'rule', 'other'] },
            count: { type: 'integer' },
            values: {
              type: 'array',
              items: objectSchema(
                {
                  name: { type: 'string' },
                  value: { type: 'string' },
                  baseValue: { type: 'string' },
                  modifiers: { type: 'array', items: { type: 'string' } },
                  kind: { type: 'string' },
                },
                ['name', 'value', 'kind'],
              ),
            },
          },
          ['id', 'name', 'type', 'kind', 'values'],
        ),
        Datasheet: objectSchema(
          {
            id: { type: 'string' },
            slug: { type: 'string' },
            referenceRoute: nullable(objectSchema({ catalogueId: { type: 'string' }, slug: { type: 'string' } }, ['catalogueId', 'slug'])),
            name: { type: 'string' },
            points: nullable({ type: 'number' }),
            keywords: stringArray(),
            profiles: { type: 'array', items: schemaRef('DatasheetProfile') },
            abilities: {
              type: 'array',
              items: objectSchema(
                {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  source: { type: 'string' },
                  description: nullable({ type: 'string' }),
                  kind: { type: 'string', enum: ['core', 'faction', 'datasheet', 'rule', 'upgrade', 'wargear'] },
                },
                ['id', 'name', 'description', 'kind'],
              ),
            },
            composition: stringArray(),
            loadout: nullable({ type: 'string' }),
            wargearOptions: stringArray(),
            wargearGroups: {
              type: 'array',
              items: objectSchema({ instruction: { type: 'string' }, options: stringArray() }, ['instruction', 'options']),
            },
            baseSize: nullable({ type: 'string' }),
            transport: nullable({ type: 'string' }),
            costs: {
              type: 'array',
              items: objectSchema(
                {
                  models: { type: 'string' },
                  cost: { type: 'string' },
                  keyword: nullable({ type: 'string' }),
                  faction: nullable({ type: 'string' }),
                  detachment: nullable({ type: 'string' }),
                },
                ['models', 'cost', 'keyword', 'faction', 'detachment'],
              ),
            },
            attachments: { type: 'array', items: schemaRef('DatasheetRelationship') },
            leaders: { type: 'array', items: schemaRef('DatasheetRelationship') },
            supporters: { type: 'array', items: schemaRef('DatasheetRelationship') },
            keywordRules: { type: 'array', items: schemaRef('KeywordRule') },
            catalogueId: { type: 'string' },
            faction: { type: 'string' },
            attribution: nullable({ type: 'string' }),
            provenance: schemaRef('DatasheetProvenance'),
          },
          [
            'id',
            'slug',
            'referenceRoute',
            'name',
            'points',
            'keywords',
            'profiles',
            'abilities',
            'composition',
            'loadout',
            'wargearOptions',
            'baseSize',
            'transport',
            'costs',
            'attachments',
            'leaders',
            'supporters',
            'keywordRules',
            'catalogueId',
            'faction',
            'attribution',
            'provenance',
          ],
        ),
        DatasheetRelationship: objectSchema(
          {
            kind: { type: 'string', enum: ['leader', 'support'] },
            name: { type: 'string' },
            entryId: nullable({ type: 'string' }),
            route: nullable(objectSchema({ catalogueId: { type: 'string' }, slug: { type: 'string' } }, ['catalogueId', 'slug'])),
          },
          ['name', 'entryId', 'route'],
        ),
        KeywordRule: objectSchema({ name: { type: 'string' }, description: { type: 'string' } }, ['name', 'description']),
        DatasheetProvenance: objectSchema(
          {
            definitions: objectSchema({ revision: { type: 'string' }, entryId: { type: 'string' } }, ['revision', 'entryId']),
            datacards: nullable(
              objectSchema(
                { revision: { type: 'string' }, resolution: { type: 'string', enum: ['external-reference', 'normalized-name'] } },
                ['revision', 'resolution'],
              ),
            ),
            rules: nullable(
              objectSchema(
                {
                  revision: { type: 'string' },
                  unitId: { type: 'string' },
                  resolution: { type: 'string', const: 'external-reference' },
                },
                ['revision', 'unitId', 'resolution'],
              ),
            ),
            fields: {
              type: 'object',
              additionalProperties: schemaRef('CanonicalFieldResolution'),
            },
          },
          ['definitions', 'datacards', 'rules', 'fields'],
        ),
        Detachment: objectSchema(
          {
            catalogueId: { type: 'string' },
            faction: { type: 'string' },
            factionSlug: { type: 'string' },
            id: { type: 'string' },
            slug: { type: 'string' },
            name: { type: 'string' },
            points: nullable({ type: 'number' }),
            dispositions: stringArray(),
            rules: { type: 'array', items: schemaRef('NamedRule') },
            enhancements: { type: 'array', items: schemaRef('PointedRule') },
            upgrades: { type: 'array', items: schemaRef('PointedRule') },
            stratagems: { type: 'array', items: schemaRef('Stratagem') },
            keywordRules: { type: 'array', items: schemaRef('KeywordRule') },
            attribution: { type: 'string' },
            provenance: objectSchema(
              {
                definitions: objectSchema({ revision: { type: 'string' }, detachmentId: { type: 'string' } }, ['revision', 'detachmentId']),
                rules: objectSchema({ revision: { type: 'string' } }, ['revision']),
                datacards: objectSchema({ revision: { type: 'string' } }, ['revision']),
              },
              ['definitions', 'rules', 'datacards'],
            ),
          },
          [
            'catalogueId',
            'faction',
            'factionSlug',
            'id',
            'slug',
            'name',
            'points',
            'dispositions',
            'rules',
            'enhancements',
            'upgrades',
            'stratagems',
            'keywordRules',
            'attribution',
            'provenance',
          ],
        ),
        NamedRule: objectSchema({ name: { type: 'string' }, description: nullable({ type: 'string' }) }, ['name', 'description']),
        PointedRule: objectSchema(
          { name: { type: 'string' }, points: nullable({ type: 'number' }), description: nullable({ type: 'string' }) },
          ['name', 'points', 'description'],
        ),
        Stratagem: objectSchema(
          {
            id: { type: 'string' },
            name: { type: 'string' },
            cp: { type: 'integer' },
            type: nullable({ type: 'string' }),
            phases: stringArray(),
            turn: nullable({ type: 'string' }),
            description: nullable({ type: 'string' }),
          },
          ['id', 'name', 'cp', 'type', 'phases', 'turn', 'description'],
        ),
        RuleBlock: {
          oneOf: [
            objectSchema({ kind: { type: 'string', const: 'prose' }, markup: { type: 'string' } }, ['kind', 'markup']),
            objectSchema({ kind: { type: 'string', const: 'heading' }, text: { type: 'string' } }, ['kind', 'text']),
            objectSchema(
              {
                kind: { type: 'string', const: 'clarification' },
                code: nullable({ type: 'string' }),
                anchor: nullable({ type: 'string' }),
                title: { type: 'string' },
                markup: { type: 'string' },
              },
              ['kind', 'code', 'anchor', 'title', 'markup'],
            ),
          ],
        },
        RuleSectionData: objectSchema(
          {
            document: objectSchema(
              {
                id: { type: 'string' },
                slug: { type: 'string' },
                title: { type: 'string' },
                updated: nullable({ type: 'string' }),
              },
              ['id', 'slug', 'title', 'updated'],
            ),
            section: objectSchema(
              {
                id: { type: 'string' },
                slug: { type: 'string' },
                title: { type: 'string' },
                entries: {
                  type: 'array',
                  items: objectSchema(
                    {
                      id: { type: 'string' },
                      code: nullable({ type: 'string' }),
                      anchor: { type: 'string' },
                      title: { type: 'string' },
                      blocks: { type: 'array', items: schemaRef('RuleBlock') },
                      facts: {
                        type: 'array',
                        items: objectSchema({ label: { type: 'string' }, markup: { type: 'string' } }, ['label', 'markup']),
                      },
                      cost: nullable({ type: 'number' }),
                      lore: nullable({ type: 'string' }),
                    },
                    ['id', 'code', 'anchor', 'title', 'blocks', 'facts', 'cost', 'lore'],
                  ),
                },
              },
              ['id', 'slug', 'title', 'entries'],
            ),
          },
          ['document', 'section'],
        ),
        DatasheetRecord: recordSchema('datasheet', schemaRef('Datasheet')),
        DetachmentRecord: recordSchema('detachment', schemaRef('Detachment')),
        RuleSectionRecord: recordSchema('rule', schemaRef('RuleSectionData')),
      },
    },
  }
}

const responseSchemas = (description: string, schema: object) => ({
  '200': {
    description,
    content: {
      'application/json': { schema },
      'text/markdown': { schema: { type: 'string' } },
    },
  },
  '400': problemResponse('Invalid request'),
  '404': problemResponse('Not found'),
  '429': problemResponse('Rate limit exceeded'),
  '503': problemResponse('Reference data is unavailable'),
})

const problemResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: schemaRef('Error') } },
})

const schemaRef = (name: string) => ({ $ref: `#/components/schemas/${name}` })

const objectSchema = (properties: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
})

const recordSchema = (kind: ReferenceKind, data: object) =>
  objectSchema(
    {
      kind: { type: 'string', const: kind },
      canonicalUrl: { type: 'string' },
      revisions: schemaRef('Revisions'),
      attribution: schemaRef('Attribution'),
      data,
    },
    ['kind', 'canonicalUrl', 'revisions', 'attribution', 'data'],
  )

const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] })
const stringArray = () => ({ type: 'array', items: { type: 'string' } })

const pathParameters = (...names: string[]) => names.map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } }))
