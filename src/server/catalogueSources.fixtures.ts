import type { CatalogueSourceConfig } from './catalogueSources'

export const catalogueSourceFixture = {
  definitions: { repository: 'example/definitions', branch: 'main', license: null },
  points: { repository: 'example/points', branch: 'main', license: null },
  rules: {
    repository: 'example/rules',
    branch: 'main',
    path: 'data/core',
    license: 'CC-BY-4.0',
    attribution: 'Example rules data',
  },
  datacards: { repository: 'example/datacards', branch: 'main', path: '11th/gdc', license: null },
  battlemaster: {
    baseUrl: 'https://battlemaster.online',
    owner: 'example',
    missionPack: 'chapter-approved-2026',
    license: null,
    attribution: 'Example terrain data',
  },
} satisfies CatalogueSourceConfig
