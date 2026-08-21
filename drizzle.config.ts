import { defineConfig } from 'drizzle-kit'

// `generate` and `check` read the schema and the journal, never a server, so the
// URL is only a placeholder until a command actually connects.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://praetorium@127.0.0.1:5432/praetorium' },
})
