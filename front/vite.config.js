import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // server: {
  //   proxy: {
  //     '/api/': {
  //       // target: 'https://wal-publisher-testnet.staketab.org', // 目标服务器
  //       target: 'https://publisher.walrus-testnet.walrus.space', // 目标服务器
  //       rewrite: (path) => path.replace(/^\/api/, ''),
  //     }
  //   },
  //   cors: true
  // }
})
