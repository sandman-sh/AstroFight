import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createViteMatchApiPlugin } from './server/viteMatchApi'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    plugins: [react(), createViteMatchApiPlugin()],
    resolve: {
      alias: {
        buffer: 'buffer/',
      },
    },
    define: {
      global: 'globalThis',
    },
  }
})
