// Lectura y escritura de formatos vectoriales.
//
// Lectura: GeoJSON (RFC 7946, con soporte del miembro "crs" antiguo que
// escribe GDAL), KML 2.2 / KMZ, GPX 1.0/1.1 y CSV/TXT de puntos (incluido el
// formato Nombre,N,E,Z,Código de SingularPad, con o sin encabezado, y el CSV
// de Excel en español, francés o portugués: punto y coma y coma decimal).
// Escritura: GPX 1.1, GeoJSON y CSV. El contenido de los archivos exportados no
// depende del idioma: claves fijas y punto decimal (son para otros programas).
//
// Los errores llevan .code (para que quien llama decida qué hacer, p. ej. no
// avisar nada si el usuario canceló) y un mensaje traducido que dice qué hacer.

import GeoJSON from 'ol/format/GeoJSON.js';
import KML from 'ol/format/KML.js';
import GPX from 'ol/format/GPX.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import {unzipSync, strFromU8} from 'fflate';
import {CRS, normalizeCode, isKnown, ensureCrs, toWgs84, unknownCrsHelp, positionHint} from './crs.js';
import {t, tn, parseLocaleNumber} from './i18n.js';

/** Error con código y mensaje para el usuario. */
function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** Error de «importación cancelada» (el usuario cerró el selector de sistema): main.js no debe avisar. */
export const cancelled = () => fail('CANCELLED', t('Importación cancelada.'));

export const VIEW_PROJ = 'EPSG:3857';

export const VECTOR_EXT = ['geojson', 'json', 'kml', 'kmz', 'gpx', 'csv', 'txt'];
export const RASTER_EXT = ['tif', 'tiff'];

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

export function kindOf(name) {
  const e = extOf(name);
  if (RASTER_EXT.includes(e)) return 'raster';
  if (VECTOR_EXT.includes(e)) return 'vector';
  return null;
}

const known = (code) => (CRS[code] ? code : null);
const word = (re) => new RegExp(`(^|[^a-z])(?:${re})(?=[^a-z]|$)`);

/**
 * Pista de SRC a partir del nombre del archivo o de los encabezados de columnas: un código EPSG
 * escrito («EPSG_25832», «(EPSG:2154)»), una zona UTM («UTM17N», «utm_zone_33s» con su datum),
 * o el nombre de un sistema nacional («Lambert93», «RD_New», «BNG», «CRTM05»…).
 */
export function crsHint(text) {
  const s = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!s.trim()) return null;
  const epsg = s.match(/epsg[\s:_-]*(\d{4,5})(?!\d)/);
  if (epsg && known(`EPSG:${epsg[1]}`)) return `EPSG:${epsg[1]}`;
  // Zona UTM: «utm17n», «UTM_17N», «utm zone 33 s», «utm zona 18S»
  const utm = s.match(/utm[\s_-]*(?:zon[ae][\s_-]*)?(\d{1,2})[\s_-]*([ns])(?![a-z])/);
  if (utm) {
    const z = Number(utm[1]), south = utm[2] === 's', zz = String(z).padStart(2, '0');
    if (z >= 1 && z <= 60) {
      if (/cr-?sirgas/.test(s) && !south && (z === 16 || z === 17)) return z === 16 ? 'EPSG:8909' : 'EPSG:8910';
      if (/etrs/.test(s) && !south) return known(`EPSG:${25800 + z}`) || `EPSG:326${zz}`;
      if (/csrs/.test(s)) return Object.keys(CRS).find((c) => CRS[c].family === 'utm-csrs' && CRS[c].params.zone === `${z}N`) || `EPSG:326${zz}`;
      if (/nad\s*_?83/.test(s) && !south) return known(`EPSG:${26900 + z}`) || `EPSG:326${zz}`;
      if (/sirgas/.test(s)) return known(`EPSG:${south ? 31977 + z - 17 : 31965 + z - 11}`) || `EPSG:${south ? 327 : 326}${zz}`;
      return `EPSG:${south ? 327 : 326}${zz}`;
    }
  }
  // Códigos de 5 cifras que no se confunden con años ni con números de punto
  const bare = s.match(/(?<!\d)(32[67]\d\d|258[23]\d|269[0-2]\d|319[6-8]\d|283[45]\d|27700|28992)(?!\d)/);
  if (bare && known(`EPSG:${bare[1]}`)) return `EPSG:${bare[1]}`;
  // Sistemas nacionales por su nombre
  if (word('lambert[\\s_-]*93|rgf[\\s_-]*93|l93').test(s)) return 'EPSG:2154';
  if (word('british[\\s_-]*national[\\s_-]*grid|osgb(?:36)?|bng').test(s)) return 'EPSG:27700';
  if (word('rd[\\s_-]*new|rdnew|amersfoort|rijksdriehoek').test(s)) return 'EPSG:28992';
  if (word('lv95|ch1903\\+?').test(s)) return 'EPSG:2056';
  if (word('nztm').test(s)) return 'EPSG:2193';
  if (word('pt[\\s_-]*tm06|tm06').test(s)) return 'EPSG:3763';
  if (word('itm|irenet95').test(s)) return 'EPSG:2157';
  if (word('origen[\\s_-]*nacional|ctm12').test(s)) return 'EPSG:9377';
  const mga = s.match(/mga[\s_-]*(?:zon[ae][\s_-]*)?(\d{2})(?!\d)/);
  if (mga) return known(`EPSG:${/gda[\s_-]*94/.test(s) ? 28300 + Number(mga[1]) : 7800 + Number(mga[1])}`);
  // Costa Rica (como antes: «CRTM05» es CR-SIRGAS salvo que diga CR05)
  if (/cr-?sirgas|(?<!\d)8908(?!\d)/.test(s)) return 'EPSG:8908';
  if (/cr05|(?<!\d)5367(?!\d)/.test(s)) return 'EPSG:5367';
  if (/crtm/.test(s)) return 'EPSG:8908';
  // UTM sin zona: no se sabe cuál
  if (/utm/.test(s)) return null;
  if (word('wgs[\\s_-]*84|4326|lat|lon|lng|latitude|longitude|latitud|longitud').test(s)) return 'EPSG:4326';
  return null;
}

/**
 * Lee un archivo vectorial.
 * @param {string} name nombre del archivo
 * @param {ArrayBuffer} buf contenido
 * @param {(info:{reason:string, hint:string|null, sample:number[]|null, unknownCode?:string|null}) => Promise<string|null>} askCrs
 *        se llama cuando el SRC no se puede determinar; devuelve un código EPSG o null para cancelar.
 *        reason es un texto ya traducido; unknownCode, el código que declara el archivo y la app no conoce.
 * @returns {Promise<{features: Feature[], crs: string, warnings: string[]}>}
 * @throws Error con .code: 'CANCELLED' (sin aviso), 'FORMAT', 'KMZ_EMPTY', 'JSON', 'CSV_EMPTY', 'CSV_COLUMNS'
 */
export async function readVector(name, buf, askCrs) {
  const ext = extOf(name);
  const warnings = [];
  if (ext === 'kmz') {
    let files;
    try {
      files = unzipSync(new Uint8Array(buf));
    } catch {
      throw fail('KMZ_EMPTY', t('El KMZ está dañado o no es un KMZ. Vuelva a exportarlo desde Google Earth o QGIS.'));
    }
    const kmlName = Object.keys(files).find((k) => /(^|\/)doc\.kml$/i.test(k)) || Object.keys(files).find((k) => /\.kml$/i.test(k));
    if (!kmlName) throw fail('KMZ_EMPTY', t('El KMZ no trae ningún archivo KML por dentro. Vuelva a exportarlo desde Google Earth o QGIS.'));
    if (Object.keys(files).some((k) => /\.(png|jpe?g|tif)$/i.test(k) && /overlay/i.test(k))) {
      warnings.push(t('Las imágenes superpuestas del KMZ no se cargan; para ver la imagen, impórtela como GeoTIFF.'));
    }
    return readKml(strFromU8(files[kmlName]), warnings);
  }
  const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  if (ext === 'kml') return readKml(text, warnings);
  if (ext === 'gpx') {
    const features = new GPX().readFeatures(text, {dataProjection: 'EPSG:4326', featureProjection: VIEW_PROJ});
    return {features, crs: 'EPSG:4326', warnings};
  }
  if (ext === 'geojson' || ext === 'json') return readGeoJSON(text, askCrs, warnings);
  if (ext === 'csv' || ext === 'txt') return readCsv(name, text, askCrs, warnings);
  throw fail('FORMAT', t('No se pueden abrir archivos .{ext}. Use GeoTIFF (.tif), KML/KMZ, GeoJSON, GPX o CSV.', {ext: ext || '?'}));
}

function readKml(text, warnings) {
  // KML 2.2 siempre usa WGS 84 lon/lat (OGC 07-147r2).
  const fmt = new KML({extractStyles: false, showPointNames: false});
  const features = fmt.readFeatures(text, {dataProjection: 'EPSG:4326', featureProjection: VIEW_PROJ});
  if (/<GroundOverlay/i.test(text)) warnings.push(t('Las imágenes superpuestas (GroundOverlay) no se cargan; para ver la imagen, impórtela como GeoTIFF.'));
  return {features, crs: 'EPSG:4326', warnings};
}

/** Pide el sistema de coordenadas; si el usuario cancela, lanza el error «CANCELLED». */
async function ask(askCrs, info) {
  const chosen = await askCrs(info);
  if (!chosen) throw cancelled();
  ensureCrs(chosen);
  return chosen;
}

async function readGeoJSON(text, askCrs, warnings) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw fail('JSON', t('El archivo no es un GeoJSON válido (el texto tiene errores). Vuelva a exportarlo desde QGIS u otro programa.'));
  }
  if (!obj || typeof obj !== 'object') throw fail('JSON', t('El archivo no es un GeoJSON válido (el texto tiene errores). Vuelva a exportarlo desde QGIS u otro programa.'));
  // RFC 7946 §4: GeoJSON es WGS 84 (lon, lat) y no tiene miembro "crs".
  // GDAL/QGIS todavía lo escriben cuando el archivo no está en WGS 84.
  let crs = 'EPSG:4326';
  const named = obj.crs && obj.crs.properties && obj.crs.properties.name;
  if (named) {
    const c = normalizeCode(named);
    if (c && isKnown(c)) crs = c;
    else {
      crs = await ask(askCrs, {reason: unknownCrsHelp(c || String(named)), hint: null, sample: firstCoord(obj), unknownCode: c || String(named)});
    }
  } else {
    const s = firstCoord(obj);
    if (s && (Math.abs(s[0]) > 180 || Math.abs(s[1]) > 90)) {
      crs = await ask(askCrs, {
        reason: t('Las coordenadas están en metros (no son latitud y longitud) y el archivo no dice en qué sistema de coordenadas están.'),
        hint: null,
        sample: s,
      });
    }
  }
  const features = new GeoJSON().readFeatures(obj, {dataProjection: crs, featureProjection: VIEW_PROJ});
  return {features, crs, warnings};
}

function firstCoord(obj) {
  let found = null;
  const walk = (c) => {
    if (found) return;
    if (Array.isArray(c) && typeof c[0] === 'number') found = c;
    else if (Array.isArray(c)) c.forEach(walk);
  };
  const geoms = [];
  if (obj.type === 'FeatureCollection') (obj.features || []).forEach((f) => f && f.geometry && geoms.push(f.geometry));
  else if (obj.type === 'Feature') obj.geometry && geoms.push(obj.geometry);
  else geoms.push(obj);
  for (const g of geoms) {
    if (g.coordinates) walk(g.coordinates);
    else if (g.geometries) g.geometries.forEach((gg) => walk(gg.coordinates));
    if (found) break;
  }
  return found;
}

// ---------------------------------------------------------------------------
// CSV

function splitCsvLine(line, sep) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const PLAIN_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/**
 * Número de una celda. Con separador «,» solo se acepta el punto decimal; con «;», tabulador o «|»
 * (CSV de Excel en español, francés o portugués) también la coma decimal: «1129531,475».
 */
function num(s, sep = ',') {
  if (s === undefined || s === null) return NaN;
  const v = String(s).trim();
  if (v === '') return NaN;
  if (sep === ',') return PLAIN_NUMBER.test(v) ? Number(v) : NaN;
  return parseLocaleNumber(v);
}

/**
 * Separador de columnas: el que da el mismo número de columnas (2 o más) en casi todas las filas
 * y más celdas numéricas. Así «P1;10,2155;-83,5929» se lee con «;» y coma decimal, aunque tenga
 * tantas comas como puntos y comas.
 */
export function detectSeparator(lines) {
  const sample = lines.slice(0, 40);
  let best = null;
  for (const sep of [';', '\t', ',', '|']) {
    if (!sample.some((l) => l.includes(sep))) continue;
    const rows = sample.map((l) => splitCsvLine(l, sep));
    const freq = new Map();
    for (const r of rows) freq.set(r.length, (freq.get(r.length) || 0) + 1);
    let cols = 1, n = 0;
    for (const [c, k] of freq) if (k > n || (k === n && c > cols)) { cols = c; n = k; }
    if (cols < 2) continue;
    const consistency = n / rows.length;
    const numeric = rows.reduce((acc, r) => acc + r.filter((c) => Number.isFinite(num(c, sep))).length, 0) / rows.length;
    const score = consistency * 10 + numeric;
    if (!best || score > best.score + 1e-9) best = {sep, score};
  }
  return best ? best.sep : ',';
}

/** Encabezado comparable: minúsculas, sin tildes, sin unidades entre paréntesis, espacios → «_». */
const normHeader = (h) => String(h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s*[([].*?[)\]]\s*/g, ' ').trim().replace(/[\s.-]+/g, '_');

// Nombres de columna en español, inglés, francés y portugués (ya normalizados)
const RE = {
  lon: /^(lon|lng|long|longitud|longitude|x_?wgs_?84|(lon|lng|long|longitud|longitude)_.*)$/,
  lat: /^(lat|latitud|latitude|y_?wgs_?84|(lat|latitud|latitude)_.*)$/,
  e: /^(x|e|este|est|leste|easting|east|coord_?x|x_coord|(este|est|leste|easting|e|x)_.*)$/,
  n: /^(y|n|norte|nord|northing|north|coord_?y|y_coord|(norte|nord|northing|n|y)_.*)$/,
  z: /^(z|h|alt|altura|altitud|altitude|elev|elevation|elevacion|elevacao|height|hauteur|cota|(z|h|alt|altura|altitud|altitude|elev|elevation|elevacion|elevacao|height|hauteur|cota)_.*)$/,
  name: /^(nombre|name|nom|nome|punto|point|ponto|pt|id|label|etiqueta|etiquette|rotulo|codigo_punto|(nombre|name|nom|nome)_.*)$/,
  code: /^(code|codigo|cod|desc|descripcion|description|descricao|nota|notas|note|notes|comment|comments|comentario|commentaire|remarque|obs|observacion|observacao|linea|line|ligne|linha)$/,
};

/** Rango típico de un Este en proyecciones TM/UTM (falso este 500 000 m). */
const isEasting = (v) => v > 100000 && v < 900000;

async function readCsv(fileName, text, askCrs, warnings) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '' && !/^\s*#/.test(l));
  if (!lines.length) throw fail('CSV_EMPTY', t('El CSV está vacío. Revise que sea el archivo correcto.'));
  // Excel escribe «sep=;» en la primera línea cuando el separador no es la coma
  let sep = null;
  const sepLine = /^\s*sep=(.)\s*$/i.exec(lines[0]);
  if (sepLine) {
    sep = sepLine[1];
    lines.shift();
    if (!lines.length) throw fail('CSV_EMPTY', t('El CSV está vacío. Revise que sea el archivo correcto.'));
  }
  if (!sep) sep = detectSeparator(lines);
  const n = (c) => num(c, sep);
  const first = splitCsvLine(lines[0], sep);
  // Hay encabezado si la primera fila tiene menos celdas numéricas que la segunda
  // (p. ej. «Name,N,E,Z,Code» frente a «E1,1129531.475,544663.869,41.2,ESQ»).
  const numCount = (row) => row.filter((c) => c !== '' && !isNaN(n(c))).length;
  const second = lines.length > 1 ? splitCsvLine(lines[1], sep) : null;
  const hasHeader = second ? numCount(first) < numCount(second) : numCount(first) === 0;
  const header = hasHeader ? first : null;
  const keys = header ? header.map(normHeader) : null;
  const rows = (hasHeader ? lines.slice(1) : lines).map((l) => splitCsvLine(l, sep));
  if (!rows.length) throw fail('CSV_EMPTY', t('El CSV solo tiene la fila de encabezado: no trae puntos.'));
  const find = (re, exclude = []) => (keys ? keys.findIndex((h, i) => !exclude.includes(i) && re.test(h)) : -1);

  let ix = -1, iy = -1, crs = null, iname = -1, iz = -1, icode = -1;
  if (header) {
    iname = find(RE.name);
    const ilon = find(RE.lon), ilat = find(RE.lat);
    if (ilon >= 0 && ilat >= 0) {
      ix = ilon; iy = ilat; crs = 'EPSG:4326';
    } else {
      ix = find(RE.e, [iname]);
      iy = find(RE.n, [iname, ix]);
      if (ix >= 0 && iy >= 0) crs = crsHint(header[ix] + ' ' + header[iy]) || crsHint(fileName);
    }
    iz = find(RE.z, [ix, iy, iname]);
    icode = find(RE.code, [ix, iy, iname, iz]);
  } else {
    // Sin encabezado: nombre, luego columnas numéricas (formato SingularPad: Nombre,N,E,Z,Código)
    const r0 = rows[0];
    const numericCols = r0.map((c, i) => (!isNaN(n(c)) ? i : -1)).filter((i) => i >= 0);
    iname = r0.findIndex((c) => isNaN(n(c)));
    if (numericCols.length < 2) {
      throw fail('CSV_COLUMNS', t('No se encontraron dos columnas con números de coordenadas. El CSV debe tener columnas como lat y lon, o este y norte.'));
    }
    const [a, b] = numericCols;
    const va = n(r0[a]), vb = n(r0[b]);
    if (Math.abs(va) <= 90 && Math.abs(vb) <= 180 && Math.abs(vb) > 90) { iy = a; ix = b; crs = 'EPSG:4326'; }
    else if (Math.abs(va) <= 180 && Math.abs(vb) <= 90 && Math.abs(va) > 90) { ix = a; iy = b; crs = 'EPSG:4326'; }
    else if (Math.abs(va) <= 90 && Math.abs(vb) <= 90 && !Number.isInteger(va) && !Number.isInteger(vb)) {
      // Dos valores que pueden ser latitud: se elige el orden que cae más cerca del lugar de
      // referencia (GPS o centro del mapa); sin él, latitud, longitud (como copia Google Maps)
      crs = 'EPSG:4326';
      const pos = positionHint();
      const d = (lon, lat) => (pos ? Math.hypot(((lon - pos.ll[0] + 540) % 360) - 180, lat - pos.ll[1]) : 0);
      if (pos && d(va, vb) < d(vb, va)) { ix = a; iy = b; }
      else { iy = a; ix = b; }
      if (!pos) warnings.push(t('Se tomaron las columnas como latitud, longitud. Si los puntos salen en otro lugar, cambie el orden de las columnas.'));
    }
    else if (isEasting(vb) && !isEasting(va)) { iy = a; ix = b; }      // N,E (SingularPad)
    else if (isEasting(va) && !isEasting(vb)) { ix = a; iy = b; }      // E,N
    else { ix = a; iy = b; warnings.push(t('No se pudo saber si las columnas son este, norte o norte, este; se tomaron como este, norte. Si los puntos salen girados o lejos, cambie el orden de las columnas.')); }
    if (numericCols.length >= 3) iz = numericCols[2];
    const lastText = r0.length - 1 - [...r0].reverse().findIndex((c) => isNaN(n(c)));
    if (lastText > iname) icode = lastText;
    if (!crs) crs = crsHint(fileName);
  }
  if (ix < 0 || iy < 0) {
    throw fail('CSV_COLUMNS', t('No se encontraron las columnas de coordenadas. Nómbrelas lat y lon (grados), o este y norte (metros), o x e y.'));
  }
  const firstRow = rows.find((r) => Number.isFinite(n(r[ix])) && Number.isFinite(n(r[iy]))) || rows[0];
  const sample = [n(firstRow[ix]), n(firstRow[iy])];
  // Una pista de latitud/longitud (p. ej. «WGS84» en el nombre del archivo) no vale si los valores son metros
  if (crs === 'EPSG:4326' && !(Math.abs(sample[0]) <= 180 && Math.abs(sample[1]) <= 90)) crs = null;
  if (crs !== 'EPSG:4326') {
    crs = await ask(askCrs, {
      reason: header
        ? t('Columnas de coordenadas: «{e}» (este) y «{n}» (norte). Elija el sistema de coordenadas en que están.', {e: header[ix], n: header[iy]})
        : t('El archivo no tiene encabezado. Elija el sistema de coordenadas de las columnas este y norte.'),
      hint: crs,
      sample,
    });
  }
  const features = [];
  let bad = 0;
  rows.forEach((r, k) => {
    const x = n(r[ix]), y = n(r[iy]);
    if (!isFinite(x) || !isFinite(y)) { bad++; return; }
    const ll = crs === 'EPSG:4326' ? [x, y] : toWgs84(crs, [x, y]);
    if (!isFinite(ll[0]) || !isFinite(ll[1]) || Math.abs(ll[1]) > 90) { bad++; return; }
    const props = {};
    if (header) header.forEach((h, i) => (props[h || `col${i + 1}`] = r[i]));
    else r.forEach((v, i) => (props[`col${i + 1}`] = v));
    props.name = iname >= 0 ? r[iname] : String(k + 1);
    if (iz >= 0 && isFinite(n(r[iz]))) props.z = n(r[iz]);
    if (icode >= 0) props.code = r[icode];
    const f = new Feature({geometry: new Point(fromLL(ll))});
    f.setProperties(props);
    features.push(f);
  });
  if (bad) warnings.push(tn(bad, 'Se omitió {n} fila sin coordenadas válidas.', 'Se omitieron {n} filas sin coordenadas válidas.'));
  return {features, crs, warnings};
}

// Conversión rápida lon/lat ↔ Web Mercator (EPSG:3857, esfera de radio 6 378 137 m)
const R = 6378137;
export function fromLL(ll) {
  const x = (ll[0] * Math.PI * R) / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (ll[1] * Math.PI) / 360));
  return [x, y];
}
export function toLL(xy) {
  return [(xy[0] / R) * (180 / Math.PI), (2 * Math.atan(Math.exp(xy[1] / R)) - Math.PI / 2) * (180 / Math.PI)];
}

// ---------------------------------------------------------------------------
// Escritura

const xmlEsc = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'})[c]); // i18n-ok
const iso = (t) => new Date(t).toISOString();

/**
 * GPX 1.1 (esquema de Topografix). <ele> se escribe solo cuando se conoce la
 * altitud sobre el nivel del mar (Android 14+), con <geoidheight> = h − H; si
 * solo hay altura elipsoidal (h), va en <extensions> para no mezclar
 * referencias verticales. La precisión (68 %) también va en <extensions>.
 */
function heightTags(p) {
  const hasMsl = p.msl !== undefined && p.msl !== null && isFinite(p.msl);
  const hasH = p.alt !== undefined && p.alt !== null && isFinite(p.alt);
  let tags = '';
  if (hasMsl) tags += `<ele>${p.msl.toFixed(2)}</ele>`;
  return {tags, hasMsl, hasH, geoid: hasMsl && hasH ? (p.alt - p.msl).toFixed(2) : null};
}

function extTags(p) {
  const x = [];
  if (p.alt !== undefined && p.alt !== null && isFinite(p.alt)) x.push(`<mc:h_elipsoidal_m>${p.alt.toFixed(2)}</mc:h_elipsoidal_m>`);
  if (p.acc !== undefined && p.acc !== null && isFinite(p.acc)) x.push(`<mc:precision68_m>${p.acc.toFixed(1)}</mc:precision68_m>`);
  if (p.avgN) x.push(`<mc:lecturas>${p.avgN}</mc:lecturas>`);
  return x.length ? `<extensions>${x.join('')}</extensions>` : '';
}

/**
 * Descripción legible del punto (en el idioma de la app; es texto para personas, no una clave).
 * Los números van con punto decimal, como en el resto del archivo.
 */
function gpxDesc(w) {
  const acc = w.acc !== undefined && w.acc !== null && isFinite(w.acc) ? w.acc.toFixed(1) : null;
  if (acc === null) return t('Precisión desconocida');
  if (w.avgN > 1) return t('Precisión ±{acc} m (68 %), promedio de {n} lecturas', {acc, n: String(w.avgN)});
  return t('Precisión ±{acc} m (68 %)', {acc});
}

export function toGPX({waypoints = [], track = null, name = 'Mapa de Campo'}) {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Mapa de Campo (Android)" xmlns="http://www.topografix.com/GPX/1/1" xmlns:mc="urn:mapacampo:gpx:1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    `  <metadata><name>${xmlEsc(name)}</name><time>${iso(Date.now())}</time></metadata>`,
  ];
  for (const w of waypoints) {
    const h = heightTags(w);
    out.push(
      `  <wpt lat="${w.lat.toFixed(8)}" lon="${w.lon.toFixed(8)}">${h.tags}<time>${iso(w.time)}</time>${h.geoid !== null ? `<geoidheight>${h.geoid}</geoidheight>` : ''}<name>${xmlEsc(w.name)}</name>${
        w.note ? `<cmt>${xmlEsc(w.note)}</cmt>` : ''
      }<desc>${xmlEsc(gpxDesc(w))}</desc>${extTags(w)}</wpt>`,
    );
  }
  if (track && track.points.length) {
    // Cada tramo grabado (al continuar una grabación detenida) va en su propio <trkseg>,
    // para que ningún programa los una con una recta a través de la pausa.
    const pts = track.points;
    const cuts = [0, ...(Array.isArray(track.breaks) ? track.breaks : []).filter((i) => i > 0 && i < pts.length).sort((a, b) => a - b), pts.length];
    out.push(`  <trk><name>${xmlEsc(track.name || 'Track')}</name>`);
    for (let k = 0; k + 1 < cuts.length; k++) {
      if (cuts[k + 1] <= cuts[k]) continue;
      out.push('   <trkseg>');
      for (const p of pts.slice(cuts[k], cuts[k + 1])) {
        const h = heightTags(p);
        out.push(`    <trkpt lat="${p.lat.toFixed(8)}" lon="${p.lon.toFixed(8)}">${h.tags}<time>${iso(p.time)}</time>${h.geoid !== null ? `<geoidheight>${h.geoid}</geoidheight>` : ''}${extTags(p)}</trkpt>`);
      }
      out.push('   </trkseg>');
    }
    out.push('  </trk>');
  }
  out.push('</gpx>');
  return out.join('\n');
}

/** Línea del recorrido; con varios tramos, MultiLineString (sin unir las pausas). */
function trackGeometry(track) {
  const pts = track.points;
  const cuts = [0, ...(Array.isArray(track.breaks) ? track.breaks : []).filter((i) => i > 0 && i < pts.length).sort((a, b) => a - b), pts.length];
  const parts = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const seg = pts.slice(cuts[k], cuts[k + 1]).map((p) => [round(p.lon, 8), round(p.lat, 8)]);
    if (seg.length > 1) parts.push(seg);
  }
  if (parts.length <= 1) return {type: 'LineString', coordinates: parts[0] || pts.map((p) => [round(p.lon, 8), round(p.lat, 8)])};
  return {type: 'MultiLineString', coordinates: parts};
}

/** GeoJSON RFC 7946 (lon, lat; sin miembro crs). */
export function toGeoJSON({waypoints = [], track = null}) {
  const features = waypoints.map((w) => ({
    type: 'Feature',
    properties: {name: w.name, note: w.note || '', time: iso(w.time), precision68_m: w.acc, h_elipsoidal_m: w.alt ?? null, H_nmm_m: w.msl ?? null, lecturas: w.avgN || 1},
    geometry: {type: 'Point', coordinates: [round(w.lon, 8), round(w.lat, 8)]},
  }));
  if (track && track.points.length > 1) {
    features.push({
      type: 'Feature',
      properties: {name: track.name || 'Track', start: iso(track.points[0].time), end: iso(track.points[track.points.length - 1].time)},
      geometry: trackGeometry(track),
    });
  }
  return JSON.stringify({type: 'FeatureCollection', features}, null, 1);
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

/** CSV con WGS 84, UTM y CRTM05 (CR-SIRGAS). `proj` = funciones de conversión. */
export function toCSV(waypoints, proj) {
  const rows = [['nombre', 'lat_WGS84', 'lon_WGS84', 'zona_UTM', 'E_UTM_WGS84', 'N_UTM_WGS84', 'E_CRTM05_EPSG8908', 'N_CRTM05_EPSG8908', 'h_elip_m', 'H_nmm_m', 'precision68_m', 'lecturas', 'fecha_utc', 'nota']];
  for (const w of waypoints) {
    const u = proj.utm([w.lon, w.lat]);
    const c = proj.crtm05([w.lon, w.lat]);
    rows.push([
      w.name, w.lat.toFixed(8), w.lon.toFixed(8), u.zone, u.e.toFixed(3), u.n.toFixed(3), c ? c[0].toFixed(3) : '', c ? c[1].toFixed(3) : '',
      w.alt != null && isFinite(w.alt) ? w.alt.toFixed(2) : '', w.msl != null && isFinite(w.msl) ? w.msl.toFixed(2) : '', w.acc != null ? w.acc.toFixed(1) : '', w.avgN || 1, iso(w.time), w.note || '',
    ]);
  }
  return '﻿' + rows.map((r) => r.map((v) => (/[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\r\n');
}
