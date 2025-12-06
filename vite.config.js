import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Rythmisi tou build target se es2020 gia na ypostirizetai to import.meta.env
  build: {
    target: 'es2020'
  },
  esbuild: {
    target: 'es2020'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2020',
    },
  },
})