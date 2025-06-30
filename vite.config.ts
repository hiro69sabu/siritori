import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // '/api' というパスで始まるリクエストが来た場合に、
      // このプロキシ設定を適用します。
      '/api': {
        // リクエストの転送先を指定します。
        // この場合、Viteの開発サーバー自身（ポート5173）を指します。
        target: 'http://localhost:5173', 
        // 異なるドメインからのリクエストを許可するために、
        // オリジンを書き換える設定を有効にします。
        changeOrigin: true,
      },
    },
  },
})