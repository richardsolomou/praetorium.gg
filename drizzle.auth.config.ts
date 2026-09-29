import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/db/authSchema.ts', './src/db/oauthSchema.ts'],
  out: './drizzle-auth',
})
