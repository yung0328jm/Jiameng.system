import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 8080,
    open: true
  },
  build: {
    rollupOptions: {
      // 網頁版建置（如 Vercel）不打包 Capacitor，避免找不到模組；執行時在瀏覽器會 try/catch 略過推播註冊
      external: ['@capacitor/core', '@capacitor/push-notifications']
    }
  }
})
