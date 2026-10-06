// Bundles src/pet.js and the parts of three.js it uses into /pet.js, which site.js loads on demand.
// Dev-only, like the other tools: the site itself still has no build step. Run: npm run pet
import { build } from 'esbuild';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const result = await build({
  entryPoints: [resolve(root, 'src/pet.js')],
  outfile: resolve(root, 'pet.js'),
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  legalComments: 'eof',
  metafile: true,
  banner: { js: '/* Ember, the 3D dragon pet. Generated from src/pet.js by `npm run pet`; edit the source, not this file. */' },
});
const bytes = Object.values(result.metafile.outputs)[0].bytes;
console.log(`Wrote pet.js (${(bytes / 1024).toFixed(0)} KB)`);
