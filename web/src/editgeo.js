// Funciones puras de la edición (sin OpenLayers), para poder probarlas en Node:
// nombres automáticos, lectura de coordenadas y números escritos, punto a distancia y
// azimut, división de líneas, renumeración, promedio de lecturas GPS, valores de los
// campos (números, sí/no) y nombres de campos y de archivos con letras de cualquier idioma.
//
// Los datos no dependen del idioma de la interfaz: las claves de los atributos son fijas
// (nombre, fecha, fuente, precision_m…) y «fuente» guarda un código (SOURCE_CODES).

import {localPlane} from './crs.js';
import {t, parseLocaleNumber} from './i18n.js';

/** Propiedades internas que no se muestran ni se exportan como campos. */
export const HIDDEN_PROPS = new Set(['geometry', 'style', 'styleUrl']);

/**
 * Códigos de «fuente» (cómo se tomó el elemento). Son datos, no textos de pantalla:
 * gps (posición GPS), gps_avg (GPS promediado), map (tocado en el mapa),
 * coords (coordenadas escritas), bearing (distancia y azimut desde otro punto).
 */
export const SOURCE_CODES = ['gps', 'gps_avg', 'map', 'coords', 'bearing'];

/**
 * Código de «fuente» de un valor guardado, también de las versiones anteriores de la app
 * (que escribían «GPS», «mapa», «coordenadas», «GPS promediado 10 s» o «distancia y rumbo (…)»).
 * Devuelve null si el valor es un texto propio de la capa.
 */
export function sourceCode(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (SOURCE_CODES.includes(s)) return s;
  const l = s.toLowerCase();
  if (l === 'gps') return 'gps';
  if (/^gps promediado\b/.test(l)) return 'gps_avg';
  if (l === 'mapa') return 'map';
  if (l === 'coordenadas') return 'coords';
  if (/^distancia y rumbo\b/.test(l)) return 'bearing';
  return null;
}

/**
 * Siguiente nombre de una serie: P001, P002… → P003. Usa el prefijo y el ancho
 * más comunes entre los nombres existentes; sin serie, empieza en `fallback`001.
 * @param {string[]} names
 * @param {string} [fallback='P']
 */
export function nextName(names, fallback = 'P') {
  const stats = new Map(); // prefijo → {max, width, count}
  for (const n of names) {
    const m = /^(.*?)(\d+)$/.exec(String(n ?? '').trim());
    if (!m) continue;
    const s = stats.get(m[1]) || {max: -Infinity, width: 0, count: 0};
    s.max = Math.max(s.max, Number(m[2]));
    s.width = Math.max(s.width, m[2].length);
    s.count++;
    stats.set(m[1], s);
  }
  let best = null;
  for (const [prefix, s] of stats) if (!best || s.count > best.s.count) best = {prefix, s};
  if (!best) return `${fallback}001`;
  return best.prefix + String(best.s.max + 1).padStart(best.s.width, '0');
}

/** Siguiente id numérico, si la capa usa ids numéricos (como los puntos del planificador). */
export function nextNumericId(ids) {
  const nums = ids.filter((v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)));
  if (!nums.length || nums.length < ids.length) return null;
  return Math.max(...nums.map(Number)) + 1;
}

/** Nombres P001…Pn con prefijo, número inicial y ancho dados. */
export function renumberNames(count, prefix = 'P', start = 1, width = 0) {
  const w = Math.max(width, String(start + count - 1).length);
  return Array.from({length: count}, (_, i) => prefix + String(start + i).padStart(w, '0'));
}

/**
 * Lee un ángulo escrito en grados decimales o en grados, minutos y segundos:
 * «10.2148», «-83.59», «10°12'53.5"N», «83 35 34.7 O», «10 12.89 N».
 * Hemisferios: N/S para la latitud; E (o L, «leste») y O/W para la longitud.
 * @param {string} text
 * @param {'lat'|'lon'} kind
 */
export function parseAngle(text, kind) {
  const isLat = kind === 'lat';
  let s = String(text ?? '').trim().toUpperCase().replace(/,/g, '.');
  if (!s) throw new Error(isLat ? t('Falta la latitud.') : t('Falta la longitud.'));
  let sign = 1;
  const hemi = /([NSEOWL])\s*$/.exec(s) || /^([NSEOWL])\s*/.exec(s);
  if (hemi) {
    if (isLat && !'NS'.includes(hemi[1])) throw new Error(t('«{text}»: para la latitud use N o S.', {text}));
    if (!isLat && !'EOWL'.includes(hemi[1])) throw new Error(t('«{text}»: para la longitud use E u O (W).', {text}));
    if ('SOW'.includes(hemi[1])) sign = -1;
    s = s.replace(hemi[0], '').trim();
  }
  if (s.startsWith('-')) {
    sign = -sign;
    s = s.slice(1).trim();
  }
  const bad = () => new Error(t(`«{text}» no es un ángulo válido. Escriba grados decimales (10.2148) o grados, minutos y segundos (10°12'53"N).`, {text}));
  const parts = s.split(/[°º'′"″\s]+/).filter(Boolean).map((p) => {
    if (!/^\d+(\.\d+)?$/.test(p)) throw bad();
    return Number(p);
  });
  if (!parts.length || parts.length > 3) throw bad();
  const [d, m = 0, sec = 0] = parts;
  if (m >= 60 || sec >= 60) throw new Error(t('«{text}»: los minutos y los segundos deben ser menores que 60.', {text}));
  if (parts.length > 1 && !Number.isInteger(d)) throw new Error(t('«{text}»: si escribe minutos, los grados deben ser enteros.', {text}));
  const v = sign * (d + m / 60 + sec / 3600);
  if (isLat && Math.abs(v) > 90) throw new Error(t('«{text}»: la latitud debe estar entre −90° y 90°.', {text}));
  if (!isLat && Math.abs(v) > 180) throw new Error(t('«{text}»: la longitud debe estar entre −180° y 180°.', {text}));
  return v;
}

/**
 * Número escrito con punto o coma decimal (y espacios o separadores de miles): «12,5», «1 129 456,789».
 * `what` es el nombre del dato ya traducido, para el mensaje de error.
 */
export function parseNumber(text, what) {
  const raw = String(text ?? '').trim();
  if (!raw) throw new Error(t('{what}: escriba un número.', {what}));
  const v = parseLocaleNumber(raw);
  if (!Number.isFinite(v)) throw new Error(t('{what}: «{text}» no es un número.', {what, text: raw}));
  return v;
}

/**
 * Punto a una distancia y un azimut (° desde el norte verdadero, sentido horario)
 * desde un origen, en un plano Transverso de Mercator local (error < 1 mm a 1 km).
 * @returns {number[]} [lon, lat]
 */
export function pointAtDistanceBearing(originLL, distance, azimuthDeg) {
  if (!(distance >= 0)) throw new Error(t('La distancia debe ser un número positivo.'));
  const pl = localPlane(originLL[0], originLL[1]);
  const a = (azimuthDeg * Math.PI) / 180;
  return pl.inv([distance * Math.sin(a), distance * Math.cos(a)]);
}

/**
 * Parte una línea (coordenadas planas) en el punto de la línea más cercano a `p`.
 * Devuelve las dos partes, o null si el corte cae en un extremo.
 * @param {number[][]} coords
 * @param {number[]} p
 */
export function splitLineCoords(coords, p) {
  if (coords.length < 2) return null;
  let best = null;
  for (let i = 0; i + 1 < coords.length; i++) {
    const a = coords[i], b = coords[i + 1];
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const L2 = vx * vx + vy * vy;
    let u = L2 > 0 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2 : 0;
    u = Math.max(0, Math.min(1, u));
    // el punto de corte conserva las demás dimensiones (Z, M) interpoladas
    const q = a.map((v, k) => (k === 0 ? a[0] + u * vx : k === 1 ? a[1] + u * vy : b[k] !== undefined && v !== undefined ? v + u * (b[k] - v) : v));
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (!best || d < best.d) best = {i, u, q, d};
  }
  const {i, u, q} = best;
  const atStart = i === 0 && u < 1e-9;
  const atEnd = i === coords.length - 2 && u > 1 - 1e-9;
  if (atStart || atEnd) return null;
  const first = coords.slice(0, i + 1);
  const second = coords.slice(i + 1);
  const same = (m, n) => Math.abs(m[0] - n[0]) < 1e-9 && Math.abs(m[1] - n[1]) < 1e-9; // i18n-ok
  if (!same(first[first.length - 1], q)) first.push(q);
  if (!same(second[0], q)) second.unshift(q);
  if (first.length < 2 || second.length < 2) return null;
  return [first, second, best.d];
}

/**
 * Promedio de lecturas GPS {lon, lat, acc, alt}: media ponderada por 1/σ² (σ = precisión, mínimo
 * 0,5 m) en un plano local. Los errores GNSS están correlacionados en el tiempo, así que se informa
 * la precisión media de las lecturas (sin dividir por √n) y, aparte, la dispersión observada.
 * @returns {{lon:number, lat:number, alt:number|null, acc:number|null, spread:number, n:number}|null}
 */
export function averageFixes(fixes) {
  const ok = (fixes || []).filter((f) => f && Number.isFinite(f.lon) && Number.isFinite(f.lat));
  if (!ok.length) return null;
  const pl = localPlane(ok[0].lon, ok[0].lat);
  let sw = 0, sx = 0, sy = 0, sz = 0, swz = 0, sacc = 0, nacc = 0;
  const pts = ok.map((f) => {
    const acc = Number(f.acc);
    return {xy: pl.fwd([f.lon, f.lat]), w: 1 / Math.max(0.5, Number.isFinite(acc) ? acc : 0.5) ** 2, f, acc};
  });
  for (const p of pts) {
    sw += p.w;
    sx += p.w * p.xy[0];
    sy += p.w * p.xy[1];
    if (p.f.alt !== null && p.f.alt !== undefined && Number.isFinite(Number(p.f.alt))) {
      sz += p.w * Number(p.f.alt);
      swz += p.w;
    }
    if (Number.isFinite(p.acc)) {
      sacc += p.acc;
      nacc++;
    }
  }
  const mx = sx / sw, my = sy / sw;
  const spread = Math.sqrt(pts.reduce((s, p) => s + (p.xy[0] - mx) ** 2 + (p.xy[1] - my) ** 2, 0) / pts.length);
  const ll = pl.inv([mx, my]);
  return {lon: ll[0], lat: ll[1], alt: swz ? sz / swz : null, acc: nacc ? sacc / nacc : null, spread, n: pts.length};
}

// Atributos que el escritor GPX de OpenLayers copia a etiquetas con tipo fijo (xsd): un texto
// ahí da <time>NaN-NaN…</time>, un <ele> que no es número o, con «ele» en texto, un error.
const GPX_DECIMAL = ['ele', 'magvar', 'geoidheight', 'hdop', 'vdop', 'pdop', 'ageofdgpsdata'];
const GPX_INTEGER = ['sat', 'dgpsid', 'number'];

/**
 * Valores para exportar a GPX los atributos con tipo fijo de un elemento: «time» en segundos
 * desde 1970 (lo que espera OpenLayers) a partir de una fecha ISO 8601, un Date o un número
 * (en segundos, o en milisegundos si es muy grande), y las alturas y cantidades como números.
 * Solo trae las claves presentes en `props`; las que no se pueden convertir valen undefined
 * (hay que quitarlas antes de escribir). Ejemplo: {time: '2026-11-05T12:00:00Z'} → {time: 1793880000}.
 */
export function gpxTypedProps(props) {
  const out = {};
  const p = props || {};
  const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim()) : NaN);
  if (p.time !== undefined) {
    const v = p.time;
    let ms = NaN;
    if (v instanceof Date) ms = v.getTime();
    else if (typeof v === 'number') ms = Math.abs(v) > 1e11 ? v : v * 1000; // 1e11 s sería el año 5138
    else if (typeof v === 'string' && /^\s*[+-]?\d{4,6}-\d{2}-\d{2}/.test(v)) ms = Date.parse(v.trim());
    // Solo años 0001 a 9999: los que se pueden escribir como xsd:dateTime de 4 cifras
    out.time = ms >= -62135596800000 && ms <= 253402300799999 ? ms / 1000 : undefined;
  }
  for (const k of GPX_DECIMAL) {
    if (p[k] === undefined) continue;
    const n = num(p[k]);
    out[k] = Number.isFinite(n) ? n : undefined;
  }
  for (const k of GPX_INTEGER) {
    if (p[k] === undefined) continue;
    const n = num(p[k]);
    out[k] = Number.isInteger(n) && n >= 0 ? n : undefined;
  }
  return out;
}

/** Campos (claves de atributos) de una lista de propiedades, en orden de aparición. */
export function fieldsOf(propsList) {
  const keys = [];
  const seen = new Set();
  for (const p of propsList) {
    for (const [k, v] of Object.entries(p || {})) {
      if (HIDDEN_PROPS.has(k) || seen.has(k)) continue;
      if (v !== null && typeof v === 'object') continue;
      seen.add(k);
      keys.push(k);
    }
  }
  return keys;
}

/**
 * Valor escrito en un formulario → valor guardado. Si el campo era numérico en la
 * capa y el texto es un número («12,5», «1.234,5», «1,234.5»), se guarda como número;
 * vacío = sin valor. Un texto que no es número se devuelve como texto (el editor avisa antes).
 */
export function coerceValue(text, wasNumber) {
  const s = String(text ?? '');
  if (s.trim() === '') return null;
  if (wasNumber) {
    const n = parseLocaleNumber(s);
    if (Number.isFinite(n)) return n;
  }
  return s;
}

/** ¿El texto es un número válido para un campo numérico? (vacío también vale: sin valor) */
export function isNumberText(text) {
  const s = String(text ?? '').trim();
  return s === '' || Number.isFinite(parseLocaleNumber(s));
}

// Sí/no en los idiomas de la app (y en los valores que suelen traer los archivos)
const TRUE_WORDS = new Set(['true', '1', 'sí', 'si', 'yes', 'oui', 'sim', 'verdadero', 'vrai', 'verdadeiro']); // i18n-ok
const FALSE_WORDS = new Set(['false', '0', 'no', 'non', 'não', 'nao', 'falso', 'faux']); // i18n-ok

/** «sí», «yes», «oui», «sim», «true», «1» → true; «no», «non», «não», «false», «0» → false; vacío → null; otro texto se deja igual. */
export function toBool(text) {
  const s = String(text ?? '').trim().toLowerCase();
  if (s === '') return null;
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  return String(text);
}

/**
 * Nombre de campo válido: letras de cualquier idioma, números y guion bajo, sin espacios
 * («Profundidad (cm)» → «Profundidad_cm», «深度» se queda igual). Máximo 40 caracteres.
 */
export function cleanFieldName(name) {
  const s = String(name || '').normalize('NFC').trim().replace(/[^\p{L}\p{M}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '');
  const n = Array.from(s).slice(0, 40).join('');
  if (!n) throw new Error(t('Escriba un nombre para el campo (letras, números o _).'));
  if (HIDDEN_PROPS.has(n)) throw new Error(t('«{name}» es un nombre reservado. Elija otro.', {name: n}));
  return n;
}

/**
 * Nombre de archivo a partir del nombre de una capa: conserva letras de cualquier idioma,
 * números, guiones y guion bajo; los espacios pasan a «_». Si no queda nada, `fallback`.
 */
export function safeFileName(name, fallback = 'layer') {
  const s = String(name ?? '').normalize('NFC').replace(/[^\p{L}\p{M}\p{N}\-_ ]+/gu, '_').trim().replace(/\s+/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
  return Array.from(s).slice(0, 80).join('') || fallback;
}

/** Fecha local AAAA-MM-DD (igual en todos los idiomas, se ordena bien y sirve en nombres de archivo). */
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
