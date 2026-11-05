// Comprueba que la app se empaqueta sin errores, en memoria (no toca android/assets/www).
// Uso: node tools/check_bundle.mjs
import * as esbuild from 'esbuild';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const r = await esbuild.build({
  entryPoints: [join(here, '..', 'src', 'main.js')],
  bundle: true,
  write: false,
  minify: false,
  format: 'iife',
  target: ['chrome80'],
  outdir: join(here, '..', '.check'),
  loader: {'.css': 'css'},
  logLevel: 'warning',
});
const js = r.outputFiles.find((f) => f.path.endsWith('.js'));
console.log(`OK: empaquetado en memoria (${Math.round(js.contents.length / 1024)} KB), ${r.warnings.length} avisos`);
