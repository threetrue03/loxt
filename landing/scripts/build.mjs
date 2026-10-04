import { build } from 'vite';
import { readFile, stat } from 'node:fs/promises';
import { version } from '../release.mjs';
const manifest = JSON.parse(await readFile(new URL('../public/assets/screenshots.json', import.meta.url), 'utf8'));
if (manifest.version !== version || !manifest.examples) throw new Error('Capture the current app version before publishing the website');
for (const image of manifest.images) await stat(new URL(`../public/assets/${image.file}`, import.meta.url));
await build();
console.log('Landing page ready in landing/dist (installer hosted on GitHub Releases)');
