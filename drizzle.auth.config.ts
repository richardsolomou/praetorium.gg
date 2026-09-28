import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/authSchema.ts',
  out: './drizzle-auth',
})
