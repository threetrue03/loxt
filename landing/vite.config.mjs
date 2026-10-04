import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { installer } from './release.mjs';
export { installer } from './release.mjs';
export const installerPath = path.resolve(import.meta.dirname, '../release/stage5', installer);
export default defineConfig({ base: './', plugins: [react(), { name: 'local-installer', configureServer(server) {
  server.middlewares.use(async (req, res, next) => {
    if (req.url?.split('?')[0] !== `/downloads/${installer}`) return next();
    try { const info = await stat(installerPath); res.setHeader('Content-Type','application/octet-stream'); res.setHeader('Content-Disposition',`attachment; filename="${installer}"`); res.setHeader('Content-Length',info.size); createReadStream(installerPath).on('error', () => res.destroy()).pipe(res); }
    catch { res.statusCode=404; res.end('Installer not found'); }
  });
} }], server: { port: 5180, strictPort: true } });
