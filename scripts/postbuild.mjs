// The ONNX Runtime bundle makes Vite emit its own copy of the wasm binary (~27 MB) that the site
// never loads: the worker uses the self-hosted copy in /ort/. Delete it so deploys stay small.
import fs from 'node:fs';
const dir = new URL('../dist/_astro/', import.meta.url);
for (const f of fs.readdirSync(dir)) if (f.endsWith('.wasm')) fs.rmSync(new URL(f, dir));
