import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({
  plugins: [react()],
  server: { port: 5184, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8014', changeOrigin: true, ws: true } } },
})
