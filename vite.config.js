import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react(), {
    name: 'development-csp',
    transformIndexHtml(html) {
      // Vite의 React 새로고침 preamble에만 개발 중 인라인 스크립트를 허용합니다.
      return command === 'serve'
        ? html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
        : html;
    },
  }],
  base: './',
  build: { rolldownOptions: { input: { desktop: 'index.html', web: 'web.html' } } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
}));
