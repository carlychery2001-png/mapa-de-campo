// Mapas base XYZ del usuario, con el mismo método que QGIS («XYZ Tiles» →
// «Nueva conexión»): una plantilla de URL con {x}, {y} y {z}.
//
// Se acepta cualquiera de las tres formas en que QGIS guarda o muestra una conexión:
//  1. La URL tal cual: https://servidor/{z}/{x}/{y}.png (también {-y}, {q}, {s}
//     y rangos de subdominio {a-c} o {0-3}; las llaves pueden venir como %7B…%7D).
//  2. La «fuente» de una capa XYZ (Propiedades de la capa → Información):
//     type=xyz&url=https://…%7Bz%7D…&zmax=19&zmin=0
//  3. El archivo XML de «Guardar conexiones» del Administrador de fuentes:
//     <qgsXYZTilesConnections><xyztiles name="…" url="…" zmin="0" zmax="19"/></qgsXYZTilesConnections>
//
// La app no trae servidores de terceros: el usuario agrega los suyos y es
// responsable de respetar las condiciones de uso de cada proveedor.
//
// Los errores llevan .code (para las pruebas y para quien llama) y un mensaje traducido.

import {t} from './i18n.js';

/** Error con código y mensaje para el usuario. */
function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const XML_ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
export const DEFAULT_ZMIN = 0;
export const DEFAULT_ZMAX = 19;

function decodeXmlEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m; // i18n-ok
    }
    return XML_ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Llaves codificadas (%7B / %7D) a { } para que funcionen los marcadores. */
export function decodeBraces(u) {
  return String(u).replace(/%7B/gi, '{').replace(/%7D/gi, '}');
}

/** Texto seguro para mostrar como HTML (la atribución de OpenLayers se inserta como HTML). */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]); // i18n-ok
}

function zoomOf(v, dflt) {
  // QGIS usa -1 para «sin límite de zoom»
  if (v === undefined || v === null || String(v).trim() === '' || Number(String(v).trim()) < 0) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 24) throw fail('BAD_ZOOM', t('El nivel de zoom «{v}» no es válido: use un número entero de 0 a 24.', {v: String(v)}));
  return n;
}

export function isQgisConnectionsXml(text) {
  return /<qgsXYZTilesConnections[\s>]/i.test(String(text || ''));
}

/**
 * Conexiones XYZ del XML que exporta QGIS («Guardar conexiones»).
 * @returns {{name:string, url:string, zmin:number, zmax:number}[]}
 */
export function parseQgisConnectionsXml(text) {
  const xml = String(text || '');
  if (!isQgisConnectionsXml(xml)) throw fail('NOT_QGIS_XML', t('El archivo no es una exportación de conexiones XYZ de QGIS. En QGIS: Administrador de fuentes de datos → XYZ → Guardar conexiones.'));
  const out = [];
  let skipped = 0;
  const re = /<xyztiles\b([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = {};
    const ar = /([A-Za-z_][\w.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = ar.exec(m[1]))) attrs[a[1]] = decodeXmlEntities(a[3] !== undefined ? a[3] : a[4]);
    if (!attrs.url) {
      skipped++;
      continue;
    }
    try {
      const c = parseXyzInput(attrs.url);
      const zmin = zoomOf(attrs.zmin, c.zmin);
      const zmax = zoomOf(attrs.zmax, c.zmax);
      if (zmin > zmax) throw fail('ZOOM_ORDER', 'zoom');
      out.push({name: (attrs.name || '').trim() || hostOf(c.url), url: c.url, zmin, zmax});
    } catch {
      skipped++; // conexión inválida (http:, sin marcadores o zoom incoherente): se omite y se cuenta
    }
  }
  if (!out.length) throw fail('NO_CONNECTIONS', t('El XML de QGIS no trae ninguna conexión XYZ que la app pueda usar (cada una necesita https:// y los marcadores {x}, {y} y {z}).'));
  out.skipped = skipped;
  return out;
}

function hostOf(url) {
  try {
    return new URL(url.replace(/\{[^}]*\}/g, '0')).hostname;
  } catch {
    return 'XYZ';
  }
}

/**
 * Interpreta lo que el usuario pega: URL, fuente de capa de QGIS o XML de conexiones.
 * @returns {{url:string, zmin:number, zmax:number, name?:string}}
 */
export function parseXyzInput(text) {
  let src = String(text || '').trim();
  if (!src) throw fail('EMPTY', t('Escriba o pegue la URL XYZ.'));
  if (isQgisConnectionsXml(src)) {
    const [c] = parseQgisConnectionsXml(src);
    return c;
  }
  let zmin = DEFAULT_ZMIN, zmax = DEFAULT_ZMAX;
  // Fuente de capa de QGIS: type=xyz&url=…&zmax=…&zmin=…
  if (!/^https?:\/\//i.test(src) && (/(^|&)type=xyz(&|$)/i.test(src) || /^url=/i.test(src))) {
    const params = {};
    for (const part of src.split('&')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const k = part.slice(0, i).trim().toLowerCase();
      let v = part.slice(i + 1);
      try {
        v = decodeURIComponent(v);
      } catch {
        // se deja tal cual
      }
      params[k] = v;
    }
    if (!params.url) throw fail('NO_URL', t('La fuente de QGIS no trae el parámetro url=. Copie la fuente completa desde Propiedades de la capa → Información.'));
    src = params.url.trim();
    zmin = zoomOf(params.zmin, zmin);
    zmax = zoomOf(params.zmax, zmax);
  }
  const url = decodeBraces(src);
  validateTemplate(url);
  if (zmin > zmax) throw fail('ZOOM_ORDER', t('El zoom mínimo no puede ser mayor que el máximo.'));
  return {url, zmin, zmax};
}

/** Lanza un error (con .code y mensaje traducido) si la plantilla no sirve. */
export function validateTemplate(url) {
  if (/\s/.test(url)) throw fail('SPACES', t('La URL no puede tener espacios. Revise que la haya copiado completa.'));
  const probe = url.replace(/\{[^}]*\}/g, '0');
  let u;
  try {
    u = new URL(probe);
  } catch {
    throw fail('NOT_URL', t('Eso no parece una URL. Debe empezar con https:// e incluir {x}, {y} y {z}.'));
  }
  if (u.protocol === 'http:') throw fail('HTTP', t('Android bloquea las conexiones http:// sin cifrar: use la versión https:// del servidor.'));
  if (u.protocol !== 'https:') throw fail('NOT_HTTPS', t('La URL debe empezar con https://.'));
  const hasZ = url.includes('{z}');
  const hasXY = url.includes('{x}') && (url.includes('{y}') || url.includes('{-y}'));
  const hasQ = url.includes('{q}');
  if (!(hasQ || (hasZ && hasXY))) throw fail('NO_MARKERS', t('Faltan marcadores: la URL necesita {x}, {y} y {z} (o {q}), como en QGIS.'));
  const unknown = (url.match(/\{[^}]*\}/g) || []).filter((tok) => !/^\{(x|y|-y|z|q|s|[a-z]-[a-z]|\d+-\d+|switch:[^}]+)\}$/i.test(tok));
  if (unknown.length) throw fail('BAD_MARKER', t('La app no reconoce el marcador {tok}. Se aceptan {x}, {y}, {-y}, {z}, {q}, {s}, {a-c} y {0-3}.', {tok: unknown[0]}));
}

/** Clave Bing/QGIS {q} (quadkey) de una tesela. */
export function quadkey(z, x, y) {
  let q = '';
  for (let i = z; i > 0; i--) {
    let d = 0;
    const mask = 1 << (i - 1);
    if (x & mask) d += 1;
    if (y & mask) d += 2;
    q += d;
  }
  return q;
}

function choices(tok) {
  let m = /^\{([a-z])-([a-z])\}$/i.exec(tok);
  if (m) {
    const a = m[1].charCodeAt(0), b = m[2].charCodeAt(0);
    const out = [];
    for (let c = Math.min(a, b); c <= Math.max(a, b); c++) out.push(String.fromCharCode(c));
    return out;
  }
  m = /^\{(\d+)-(\d+)\}$/.exec(tok);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    const out = [];
    for (let c = Math.min(a, b); c <= Math.max(a, b) && out.length < 64; c++) out.push(String(c));
    return out;
  }
  m = /^\{switch:([^}]+)\}$/i.exec(tok);
  if (m) return m[1].split(',').map((s) => s.trim()).filter(Boolean);
  if (/^\{s\}$/i.test(tok)) return ['a', 'b', 'c'];
  return null;
}

/**
 * URL de una tesela (z, x, y con origen arriba a la izquierda, como XYZ/OpenLayers).
 * Los subdominios se eligen siempre igual para la misma tesela (aprovecha la caché).
 */
export function tileUrl(template, z, x, y) {
  return template.replace(/\{[^}]*\}/g, (tok) => {
    switch (tok) {
      case '{x}': return String(x);
      case '{y}': return String(y);
      case '{-y}': return String((1 << z) - 1 - y);
      case '{z}': return String(z);
      case '{q}': return quadkey(z, x, y);
      default: {
        const c = choices(tok);
        return c && c.length ? c[Math.abs(x + y) % c.length] : tok;
      }
    }
  });
}

/** Conexión lista para guardar en los ajustes. */
export function makeConnection({name, input, zmin, zmax, attribution}, id) {
  const c = parseXyzInput(input);
  const zi = zoomOf(zmin, c.zmin), za = zoomOf(zmax, c.zmax);
  if (zi > za) throw fail('ZOOM_ORDER', t('El zoom mínimo no puede ser mayor que el máximo.'));
  return {
    id: id || `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    name: String(name || '').trim().slice(0, 60) || c.name || hostOf(c.url),
    url: c.url,
    zmin: zi,
    zmax: za,
    attribution: String(attribution || '').trim().slice(0, 200),
  };
}
