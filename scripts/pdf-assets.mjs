import { cp, mkdir } from 'node:fs/promises';
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  await mkdir('public/pdf-assets', { recursive: true });
  await cp(`node_modules/pdfjs-dist/${folder}`, `public/pdf-assets/${folder}`, { recursive: true });
}
