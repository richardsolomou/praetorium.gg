import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/d1AuthSchema.ts',
  out: './drizzle-auth',
})
