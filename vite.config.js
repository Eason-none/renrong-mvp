import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

// H5/mp-weixin都直接打到 scripts/api-proxy.js（VITE_API_PROXY_URL，默认localhost:5555），
// 代理自带CORS头，不再需要vite dev server做同源转发。
export default defineConfig({
  plugins: [uni()],
})
