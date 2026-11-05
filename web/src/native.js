// Puente con la parte nativa de Android (objeto MCNative inyectado con
// addJavascriptInterface). Si no existe (navegador de escritorio), la app
// funciona en "modo web" para pruebas: archivos en memoria y GPS del navegador.

/* global MCNative */

export const HAS_NATIVE = typeof window !== 'undefined' && typeof window.MCNative !== 'undefined';

/** Llama a un método nativo de forma segura; devuelve null si falla o no existe. */
export function call(method, ...args) {
  if (!HAS_NATIVE || typeof window.MCNative[method] !== 'function') return null;
  try {
    return window.MCNative[method](...args);
  } catch (e) {
    console.error('MCNative.' + method, e);
    return null;
  }
}

export function callJSON(method, ...args) {
  const s = call(method, ...args);
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Callbacks que la parte nativa invoca con evaluateJavascript("MC.xxx(...)").
const handlers = {};
window.MC = new Proxy(
  {},
  {
    get(_t, name) {
      return (...args) => {
        const list = handlers[name];
        if (!list || !list.length) return false;
        let result = false;
        for (const fn of list) {
          try {
            const r = fn(...args);
            if (r) result = r;
          } catch (e) {
            console.error('MC.' + String(name), e);
          }
        }
        return result;
      };
    },
  },
);

/** Registra un manejador para un evento nativo (onLocation, onGnss, onHeading, ...). */
export function on(name, fn) {
  (handlers[name] = handlers[name] || []).push(fn);
}

export const ORIGIN = 'https://appassets.androidplatform.net';

/** URL local de un archivo importado (servido por la app con soporte de rangos). */
export function fileUrl(name) {
  return `${ORIGIN}/files/${encodeURIComponent(name)}`;
}

// ---------------------------------------------------------------------------
// Lectura por rangos de bytes para GeoTIFF grandes.
// Modo 'query' (normal): el rango va en la URL (?start=&end=) y la app nativa
// devuelve exactamente esos bytes; aquí se reconstruye la respuesta 206 que
// esperan geotiff.js y OpenLayers. (No se usa la cabecera HTTP Range porque el
// WebView de Android la aplica por su cuenta a las respuestas interceptadas.)
// Modo 'bridge': respaldo que lee el rango por el puente JS (base64).
let rangeMode = 'query';

export async function detectRangeMode() {
  if (!HAS_NATIVE) return 'none';
  try {
    const files = callJSON('listFiles') || [];
    const f = files.find((x) => x.size > 64);
    if (f) {
      const r = await fetch(`${fileUrl(f.name)}?start=16&end=31`);
      const b = await r.arrayBuffer();
      rangeMode = r.ok && b.byteLength === 16 ? 'query' : 'bridge';
    }
  } catch {
    rangeMode = 'bridge';
  }
  return rangeMode;
}

export function getRangeMode() {
  return rangeMode;
}

function headerValue(headers, key) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(key);
  for (const k of Object.keys(headers)) if (k.toLowerCase() === key.toLowerCase()) return headers[k];
  return null;
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function partial(bytes, start, total) {
  return new Response(bytes, {
    status: 206,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
      'Content-Range': `bytes ${start}-${start + bytes.byteLength - 1}/${total}`,
      'Accept-Ranges': 'bytes',
    },
  });
}

/**
 * Cargador compatible con la opción `loader` de ol/source/GeoTIFF y con
 * geotiff.js fromCustomClient.
 */
export async function rangeLoader(url, headers, signal) {
  const range = headerValue(headers, 'Range');
  if (!url.includes('/files/') || !range) return fetch(url, {headers, signal});
  const m = /bytes=(\d+)-(\d*)/.exec(range);
  if (!m) return fetch(url, {headers, signal});
  const start = Number(m[1]);
  const endReq = m[2] === '' ? null : Number(m[2]);
  if (rangeMode === 'bridge') {
    const name = decodeURIComponent(url.split('/files/')[1]);
    const total = Number(call('fileSize', name)) || 0;
    const end = Math.min(endReq ?? total - 1, total - 1);
    const bytes = end >= start ? b64ToBytes(call('readRange', name, start, end - start + 1) || '') : new Uint8Array(0);
    return partial(bytes, start, total);
  }
  const r = await fetch(`${url}?start=${start}${endReq !== null ? `&end=${endReq}` : ''}`, {signal});
  if (!r.ok) {
    console.warn('Lectura por rangos:', r.status, range);
    return r;
  }
  const total = Number(r.headers.get('X-Total-Length')) || 0;
  return partial(await r.arrayBuffer(), start, total);
}

/** Cliente para geotiff.js fromCustomClient (mismo patrón que OpenLayers). */
export function customClient(url, loader = rangeLoader) {
  return {
    url,
    request: async (options) => {
      const response = await loader(url, (options && options.headers) || {}, (options && options.signal) || new AbortController().signal);
      return Object.assign(response, {
        getHeader: (name) => response.headers.get(name),
        getData: () => response.arrayBuffer(),
      });
    },
  };
}
