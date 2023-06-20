import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  onSuccess: 'node dist/index.cjs',
  watch: true,
})
