// Empaqueta la app web en android/assets/www (node build.mjs)
import * as esbuild from 'esbuild';
import {mkdirSync, copyFileSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'android', 'assets', 'www');
rmSync(out, {recursive: true, force: true});
mkdirSync(join(out, 'demo'), {recursive: true});

const result = await esbuild.build({
  metafile: true,
  entryPoints: [join(here, 'src', 'main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome80'],
  outfile: join(out, 'app.js'),
  legalComments: 'linked',
  logLevel: 'info',
  loader: {'.css': 'css'},
});
copyFileSync(join(here, 'index.html'), join(out, 'index.html'));
mkdirSync(join(out, 'img'), {recursive: true});
for (const f of readdirSync(join(here, 'static'))) copyFileSync(join(here, 'static', f), join(out, 'img', f));

// Datos de demostración: la ruta serpentina de la cancha de EARTH
const gis = join(here, '..', '..', 'salidas');
for (const [src, dst] of [
  [join(gis, 'cancha_futbol_EARTH.geojson'), 'cancha_futbol_EARTH.geojson'],
  [join(gis, 'ruta_5m', 'ruta_serpentina.geojson'), 'ruta_serpentina.geojson'],
  [join(gis, 'ruta_5m', 'puntos_levantamiento.geojson'), 'puntos_levantamiento.geojson'],
  [join(gis, '..', 'ortofoto_EARTH', 'limite_Universidad_EARTH_OSM.geojson'), 'limite_Universidad_EARTH_OSM.geojson'],
]) {
  const local = join(here, 'demo', dst); // copia incluida en el repositorio
  const from = existsSync(local) ? local : src;
  if (!existsSync(from)) throw new Error('Falta ' + src);
  copyFileSync(from, join(out, 'demo', dst));
}

// Licencias de las bibliotecas incluidas (BSD, MIT y Apache exigen conservar el aviso)
const pkgs = new Set();
const re = /node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/;
for (const input of Object.keys(result.metafile.inputs)) {
  const m = re.exec(input);
  if (m) pkgs.add(m[1].split('\\').join('/'));
}
const NL = '\n';
const parts = ['Mapa de Campo incluye las siguientes bibliotecas de código abierto.' + NL];
for (const pkg of [...pkgs].sort()) {
  const dir = join(here, 'node_modules', pkg);
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const lic = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  parts.push(NL + '==================== ' + pkg + ' ' + meta.version + ' (' + (meta.license || 'ver texto') + ') ====================' + NL);
  parts.push(lic ? readFileSync(join(dir, lic), 'utf8') : 'Licencia declarada en package.json: ' + meta.license + '. ' + (meta.homepage || '') + NL);
}
const legal = parts.join('');
mkdirSync(join(out, 'licencias'), {recursive: true});
writeFileSync(join(out, 'licencias', 'LICENCIAS_TERCEROS.txt'), legal);
mkdirSync(join(here, '..', 'licencias'), {recursive: true});
writeFileSync(join(here, '..', 'licencias', 'LICENCIAS_TERCEROS.txt'), legal);
console.log('Licencias:', [...pkgs].join(', '));
console.log('OK →', out);
