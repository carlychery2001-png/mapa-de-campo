// Comprueba las traducciones de la interfaz (node test/test_i18n.mjs).
//
// 1. Cada texto marcado en src/ con t('…'), tn(n, '…', '…') o N_('…'), y cada data-i18n* de
//    index.html, tiene traducción en inglés, francés y portugués.
// 2. Cada traducción conserva los mismos {marcadores} y las mismas etiquetas HTML que el español.
// 3. t() solo recibe textos literales (salvo en líneas marcadas «i18n-dynamic»).
// 4. Avisa de textos de la interfaz que quedaron sin marcar: texto entre etiquetas dentro de
//    plantillas HTML y literales con tildes, ñ, ¿ o ¡ fuera de t(). Una línea con «i18n-ok» se omite.
// 5. La ayuda (src/help/*.js) tiene las mismas claves, los mismos <h4> y los mismos enlaces en
//    todos los idiomas, y no es una copia del español.
import {readFileSync, readdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src');
const LANGS = ['en', 'fr', 'pt'];
const errors = [];
const warnings = [];

// --- Tablas de traducción
const tables = (await import(pathToFileURL(join(SRC, 'i18n', 'index.js')).href)).default;
const dict = new Map();
for (const table of tables) {
  for (const [k, v] of Object.entries(table)) {
    if (dict.has(k)) warnings.push(`clave repetida en dos tablas: «${k.slice(0, 60)}»`);
    dict.set(k, v);
  }
}

// --- Lector de literales de JavaScript
function readLiteral(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (q === '`' && c === '$' && src[j + 1] === '{') return {error: 'plantilla con ${…}', end: j};
    if (c === q) break;
    if (q !== '`' && c === '\n') return {error: 'literal sin cerrar', end: j};
    j++;
  }
  const raw = src.slice(i, j + 1);
  let value;
  try {
    value = Function(`"use strict"; return (${raw});`)();
  } catch (e) {
    return {error: 'literal ilegible: ' + e.message, end: j};
  }
  return {value, end: j + 1};
}
const skipWs = (src, i) => { while (/\s/.test(src[i] || '')) i++; return i; };
function lineOf(src, i) { return src.slice(0, i).split('\n').length; }
function lineText(src, i) { const a = src.lastIndexOf('\n', i) + 1; const b = src.indexOf('\n', i); return src.slice(a, b < 0 ? src.length : b); }

/** Salta un argumento cualquiera hasta la coma de primer nivel. */
function skipArg(src, i) {
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') { const r = readLiteral(src, i); i = r.error ? r.end + 1 : r.end; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { if (depth === 0) return i; depth--; }
    else if (c === ',' && depth === 0) return i;
    i++;
  }
  return i;
}

const used = new Map(); // clave → 'archivo:línea'
const literalSpans = []; // [archivo, inicio, fin] de literales ya marcados
function use(key, where) { if (!used.has(key)) used.set(key, where); }

function scanFile(file, src) {
  const rel = file;
  const re = /(?<![\w.$])(t|tn|N_)\(/g;
  let m;
  while ((m = re.exec(src))) {
    const fn = m[1];
    let i = skipWs(src, m.index + m[0].length);
    const where = `${rel}:${lineOf(src, m.index)}`;
    const before = lineText(src, m.index).trimStart();
    if (before.startsWith('//') || before.startsWith('*') || before.startsWith('/*')) continue; // ejemplos en comentarios
    if (/function\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index + (m[0].length - fn.length - 1)))) continue; // definición de t/tn/N_
    const dynamicOk = /i18n-dynamic/.test(lineText(src, m.index));
    const want = fn === 'tn' ? 2 : 1;
    if (fn === 'tn') { i = skipArg(src, i); if (src[i] !== ',') { errors.push(`${where}: tn() sin argumentos de texto`); continue; } i = skipWs(src, i + 1); }
    for (let k = 0; k < want; k++) {
      const q = src[i];
      if (q !== "'" && q !== '"' && q !== '`') {
        if (!dynamicOk) errors.push(`${where}: ${fn}() con un texto que no es literal (márquelo con N_ y ponga «i18n-dynamic» en la línea)`);
        break;
      }
      const r = readLiteral(src, i);
      if (r.error) { errors.push(`${where}: ${fn}(): ${r.error}`); break; }
      const after = skipWs(src, r.end);
      if (src[after] !== ',' && src[after] !== ')') { errors.push(`${where}: ${fn}() con texto concatenado o expresión; use {marcadores}`); break; }
      literalSpans.push([rel, i, r.end]);
      use(r.value, where);
      i = skipWs(src, after + 1);
    }
  }
}

// --- Recorre src/ (sin las tablas ni la ayuda)
const files = [];
for (const f of readdirSync(SRC)) if (f.endsWith('.js')) files.push(f);
const sources = {};
for (const f of files) { sources[f] = readFileSync(join(SRC, f), 'utf8'); scanFile(f, sources[f]); }

// index.html
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
for (const m of html.matchAll(/data-i18n(?:-aria|-title)?="([^"]*)"/g)) use(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'), 'index.html');
// Textos visibles de index.html sin data-i18n
for (const m of html.matchAll(/<(button|span|div|h\d|label|p|a)\b([^>]*)>([^<]*[A-Za-zÁÉÍÓÚáéíóúñ]{2,}[^<]*)</g)) {
  if (!/data-i18n=/.test(m[2])) warnings.push(`index.html: texto sin data-i18n: «${m[3].trim()}»`);
}
for (const m of html.matchAll(/\saria-label="([^"]+)"/g)) {
  const tag = html.slice(html.lastIndexOf('<', m.index), m.index + m[0].length);
  if (!/data-i18n-aria=/.test(tag)) errors.push(`index.html: aria-label sin data-i18n-aria: «${m[1]}»`);
}

// --- 1 y 2: cada texto usado tiene traducción y conserva marcadores y etiquetas
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(',');
const tags = (s) => [...s.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((x) => x[0].toLowerCase()).sort().join(',');
for (const [key, where] of used) {
  const e = dict.get(key);
  if (!e) { errors.push(`${where}: falta traducción de «${key}»`); continue; }
  for (const l of LANGS) {
    const v = e[l];
    if (typeof v !== 'string' || !v.trim()) { errors.push(`${where}: falta «${l}» para «${key}»`); continue; }
    if (placeholders(v) !== placeholders(key)) errors.push(`${where}: marcadores distintos en «${l}» para «${key}» → «${v}»`);
    if (tags(v) !== tags(key)) errors.push(`${where}: etiquetas HTML distintas en «${l}» para «${key}» → «${v}»`);
  }
}
let unused = 0;
for (const k of dict.keys()) if (!used.has(k)) unused++;
if (unused) warnings.push(`${unused} traducciones que ya no se usan (puede borrarlas)`);

// --- 4: textos de la interfaz sin marcar
const BRAND = /^(?:[\s\d.,:;·×%°′″±+\-–—/()|#…→←↑↓●○✓✗▲▼"'«»=&;]|&[a-z]+;|Mapa de Campo|GeoTIFF|GeoJSON|KML|KMZ|GPX|CSV|TXT|XML|COG|GDAL|QGIS|SingularPad|OpenLayers|OpenStreetMap|OSM|Google|WGS ?84|UTM|EPSG|CRTM05|CR05|CR-SIRGAS|SIRGAS|RTK|GNSS|GPS|NTRIP|DJI|Pix4D|XYZ|WebGL|WebView|Android|ODbL|MIT|BSD|Apache|https?:\/\/\S+|px|m²|m|km|ha|cm|mm|s|min|h|N|S|E|O|W|NE|NO|NW|SE|SO|SW|Lat|Lon|lat|lon|Z|X|Y|ID|id|P\d+|Ctrl)+$/;
function stripMarked(file, src) {
  // Reemplaza por espacios los literales ya marcados para no contarlos
  const chars = src.split('');
  for (const [f, a, b] of literalSpans) if (f === file) for (let i = a; i < b; i++) if (chars[i] !== '\n') chars[i] = ' ';
  return chars.join('');
}
const SKIP_FILES = new Set(['i18n.js', 'geotiff_patch.js', 'author.js']);
for (const f of files) {
  if (SKIP_FILES.has(f)) continue;
  const src = stripMarked(f, sources[f]);
  const lines = src.split('\n');
  const orig = sources[f].split('\n');
  let inBlock = false;
  lines.forEach((line, n) => {
    const o = orig[n];
    if (/i18n-ok|console\.(log|warn|error|info|debug)/.test(o)) return;
    let L = line;
    if (inBlock) { const e = L.indexOf('*/'); if (e < 0) return; L = L.slice(e + 2); inBlock = false; }
    L = L.replace(/\/\*.*?\*\//g, '');
    const b = L.indexOf('/*'); if (b >= 0) { L = L.slice(0, b); inBlock = true; }
    L = L.replace(/(^|[^:'"`\\])\/\/.*$/, '$1');
    if (!L.trim()) return;
    // Texto entre etiquetas en plantillas HTML
    for (const m of L.matchAll(/>([^<>`]*?)</g)) {
      const txt = m[1].replace(/\$\{[^}]*\}/g, ' ').trim();
      if (txt && /[A-Za-zÁÉÍÓÚáéíóúñ]{2,}/.test(txt) && !BRAND.test(txt)) warnings.push(`${f}:${n + 1}: texto sin traducir entre etiquetas: «${txt.slice(0, 70)}»`);
    }
    // Atributos visibles
    for (const m of L.matchAll(/\b(aria-label|placeholder|title)="([^"$]*[A-Za-zÁÉÍÓÚáéíóúñ]{2,}[^"$]*)"/g)) {
      if (!BRAND.test(m[2]) && !/^[\w.@…-]+$/.test(m[2]) && !/AIza/.test(m[2])) warnings.push(`${f}:${n + 1}: ${m[1]} sin traducir: «${m[2]}»`);
    }
    // Literales que llegan a la pantalla: avisos, títulos de paneles, diálogos, etiquetas y errores
    for (const m of L.matchAll(/(?:\b(?:toast|openSheet|dialog|confirmDialog|promptDialog|showProgress)\(\s*|\b(?:label|title|hint|text|msg|message):\s*|\.(?:textContent|innerText|title)\s*=\s*|throw new Error\(\s*)(['"`])((?:\.|(?!\1).)*?[A-Za-z]{3,}(?:\.|(?!\1).)*?)\1/g)) {
      if (!BRAND.test(m[2]) && !/^[a-z]+$/.test(m[2]) && !/^#|^\.|^[a-z-]+$/.test(m[2])) warnings.push(`${f}:${n + 1}: texto de pantalla sin t(): «${m[2].slice(0, 70)}»`);
    }
    // Literales con letras del español
    if (/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(L)) {
      for (const m of L.matchAll(/(['"`])((?:\\.|(?!\1).)*?[áéíóúñÁÉÍÓÚÑ¿¡](?:\\.|(?!\1).)*?)\1/g)) warnings.push(`${f}:${n + 1}: literal en español sin t(): «${m[2].slice(0, 70)}»`);
    }
  });
}

// --- 5: ayuda por idioma
const help = {};
for (const l of ['es', ...LANGS]) help[l] = (await import(pathToFileURL(join(SRC, 'help', `${l}.js`)).href)).default;
const h4 = (s) => (String(s).match(/<h4>/g) || []).length;
const hrefs = (s) => [...String(s).matchAll(/href="([^"]+)"/g)].map((x) => x[1]).sort().join(' ');
for (const l of LANGS) {
  const a = help.es, b = help[l];
  if (b === a) { errors.push(`help/${l}.js: todavía es la ayuda en español`); continue; }
  for (const k of Object.keys(a)) {
    if (typeof b[k] !== 'string') { errors.push(`help/${l}.js: falta «${k}»`); continue; }
    if (b[k] === a[k] && /[a-z]{4}/.test(a[k])) errors.push(`help/${l}.js: «${k}» sin traducir`);
    if (h4(b[k]) !== h4(a[k])) errors.push(`help/${l}.js: «${k}» tiene ${h4(b[k])} títulos <h4> y el español ${h4(a[k])}`);
    if (hrefs(b[k]) !== hrefs(a[k])) errors.push(`help/${l}.js: «${k}» con enlaces distintos`);
    if (tags(b[k]).split(',').filter((x) => x.startsWith('</')).length !== tags(a[k]).split(',').filter((x) => x.startsWith('</')).length) warnings.push(`help/${l}.js: «${k}» con distinta cantidad de etiquetas de cierre`);
  }
}

// --- 6: el propio módulo i18n
const i18n = await import(pathToFileURL(join(SRC, 'i18n.js')).href);
const check = (got, want, what) => { if (got !== want) errors.push(`i18n: ${what}: «${got}» ≠ «${want}»`); };
check(i18n.deviceLang(['fr-CA', 'en-US']), 'fr', 'deviceLang fr-CA');
check(i18n.deviceLang(['de-DE', 'pt-BR']), 'pt', 'deviceLang de→pt');
check(i18n.deviceLang(['zh-CN']), 'en', 'deviceLang sin idioma disponible');
check(i18n.parseLocaleNumber('12,5'), 12.5, 'parse 12,5');
check(i18n.parseLocaleNumber('1.234,5'), 1234.5, 'parse 1.234,5');
check(i18n.parseLocaleNumber('1,234.5'), 1234.5, 'parse 1,234.5');
check(i18n.parseLocaleNumber('-0.75'), -0.75, 'parse -0.75');
check(Number.isNaN(i18n.parseLocaleNumber('12a')), true, 'parse 12a');
i18n.setLang('fr');
check(i18n.t('{n} y {m}', {n: 1, m: 2}), '1 y 2', 'marcadores sin traducción');
check(i18n.fmtNum(1234.5, 1).replace(/\s/g, ' '), '1 234,5', 'fmtNum fr');
i18n.setLang('en');
check(i18n.fmtNum(1234.5, 1), '1,234.5', 'fmtNum en');

// --- Filtro opcional: node test/test_i18n.mjs --only editor.js,editgeo.js (solo esos archivos)
const onlyIdx = process.argv.indexOf('--only');
if (onlyIdx > 0) {
  const keep = process.argv[onlyIdx + 1].split(',').map((x) => x.trim());
  const match = (m) => keep.some((f) => m.startsWith(f + ':') || m.startsWith('help/' + f) || m.includes(' ' + f + ':'));
  const e2 = errors.filter(match), w2 = warnings.filter(match);
  errors.length = 0; errors.push(...e2);
  warnings.length = 0; warnings.push(...w2);
}

// --- Resultado
for (const w of warnings) console.log('aviso:', w);
for (const e of errors) console.log('ERROR:', e);
console.log(`${used.size} textos marcados · ${dict.size} traducciones · ${errors.length} errores · ${warnings.length} avisos`);
if (process.argv.includes('--strict') && warnings.some((w) => /sin traducir|sin t\(\)|sin data-i18n/.test(w))) process.exitCode = 1;
if (process.argv.includes('--file')) { const f = process.argv[process.argv.indexOf('--file') + 1]; console.log('--- solo', f); }
if (errors.length) process.exitCode = 1;
