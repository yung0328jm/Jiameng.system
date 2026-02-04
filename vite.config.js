import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      // 確保預支模組在 Vercel/Linux 環境能被正確解析
      '../utils/advanceStorage': path.resolve(__dirname, 'src/utils/advanceStorage.js'),
      '../utils/advanceStorage.js': path.resolve(__dirname, 'src/utils/advanceStorage.js')
    }
  },
  server: {
    port: 8080,
    open: true
  }
})
