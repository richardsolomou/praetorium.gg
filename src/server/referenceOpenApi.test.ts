import { expect, it } from 'vitest'
import { referenceOpenApi } from './referenceOpenApi'

it('publishes concrete OpenAPI response contracts', () => {
  const openApi = referenceOpenApi(new Request('https://praetorium.gg/api/reference/v1/openapi.json'))

  expect(openApi).toMatchObject({
    paths: {
      '/api/reference/v1/search': {
        get: {
          responses: {
            '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/ReferenceSearchResponse' } } } },
            '400': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '429': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '503': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
    },
    components: {
      schemas: {
        ProductGuide: { required: ['product', 'capabilities', 'boundaries', 'dataModel', 'agentWorkflow'] },
        ReferenceIndex: { required: ['corpusRevision', 'revisions', 'kinds', 'factions', 'missionPacks', 'ruleDocuments'] },
        ReferenceSearchResponse: { required: ['query', 'results', 'revisions', 'nextCursor'] },
        UnitIndex: { required: ['faction', 'battleSize', 'detachment', 'units', 'revisions'] },
        ReferenceRecord: { required: ['document', 'data'] },
        DatasheetRecord: {
          properties: { data: { $ref: '#/components/schemas/Datasheet' } },
          required: ['kind', 'canonicalUrl', 'revisions', 'attribution', 'data'],
        },
        RuleSectionData: { required: ['document', 'section'] },
        RuleBlock: { oneOf: expect.arrayContaining([expect.objectContaining({ required: ['kind', 'markup'] })]) },
        Error: { required: ['error'] },
      },
    },
  })
})
