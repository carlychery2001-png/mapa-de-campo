// Dibujo de GeoTIFF sin WebGL (modo compatible).
//
// OpenLayers dibuja los GeoTIFF con WebGL y también los reproyecta con WebGL.
// Algunos teléfonos (GPU en lista negra del WebView, emuladores sin GPU) no
// ofrecen WebGL: entonces se usa esta capa, que lee cada tesela con geotiff.js,
// la pinta en un canvas 2D y deja que OpenLayers la reproyecte con su
// triangulación en canvas 2D (ol/reproj/Tile). Es más lenta, pero el mapa
// sigue funcionando y la georreferencia es la misma.

import TileLayer from 'ol/layer/Tile.js';
import TileImage from 'ol/source/TileImage.js';
import TileGrid from 'ol/tilegrid/TileGrid.js';
import TileState from 'ol/TileState.js';
import {fromCustomClient, fromBlob} from 'geotiff';
import {customClient} from './native.js';
import './geotiff_patch.js';

let glState = null;
export const glInfo = {canvas: null, offscreen: null};

function tryGL(canvas) {
  try {
    const gl = canvas.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * ¿El WebView ofrece WebGL? OpenLayers lo usa en un canvas normal (dibujo) y
 * en un OffscreenCanvas (reproyección), así que se comprueban ambos.
 */
export function webglAvailable() {
  if (glState === null) {
    glInfo.canvas = tryGL(document.createElement('canvas'));
    glInfo.offscreen = typeof OffscreenCanvas === 'undefined' ? 'n/a' : tryGL(new OffscreenCanvas(1, 1));
    glState = glInfo.canvas && glInfo.offscreen !== false;
  }
  return glState;
}

// Mismas escalas que layers.js (códigos neutros; 'terreno' y 'gris' son los nombres antiguos guardados)
const RAMP_STOPS = {
  terrain: [[0.0, [44, 123, 182]], [0.2, [171, 217, 233]], [0.4, [255, 255, 191]], [0.6, [253, 174, 97]], [0.8, [215, 25, 28]], [1.0, [120, 50, 30]]],
  gray: [[0, [0, 0, 0]], [1, [255, 255, 255]]],
};
const RAMP_ALIAS = {terreno: 'terrain', gris: 'gray'};

function rampColor(v, name) {
  const st = RAMP_STOPS[RAMP_ALIAS[name] || name] || RAMP_STOPS.gray;
  if (v <= st[0][0]) return st[0][1];
  for (let i = 1; i < st.length; i++) {
    if (v <= st[i][0]) {
      const [t0, c0] = st[i - 1], [t1, c1] = st[i];
      const f = (v - t0) / (t1 - t0);
      return [c0[0] + f * (c1[0] - c0[0]), c0[1] + f * (c1[1] - c0[1]), c0[2] + f * (c1[2] - c0[2])];
    }
  }
  return st[st.length - 1][1];
}

/**
 * @param {object} rec registro de la capa (crs, opacity, ramp, ...)
 * @param {object} info metadatos de inspectGeoTIFF
 * @param {{blob?: Blob, url?: string}} src origen del archivo
 */
export async function makeCanvasRasterLayer(rec, info, src) {
  const tiff = src.blob ? await fromBlob(src.blob) : await fromCustomClient(customClient(src.url), {});
  const n = await tiff.getImageCount();
  const imgs = [];
  const masks = [];
  for (let i = 0; i < n; i++) {
    const im = await tiff.getImage(i);
    let sub = 0;
    try {
      sub = im.fileDirectory.getValue('NewSubfileType') || 0;
    } catch {
      sub = 0;
    }
    if (i > 0 && sub & 4) {
      masks.push(im); // máscara de transparencia de GDAL, no es una vista general
      continue;
    }
    imgs.push(im);
  }
  const base = imgs[0];
  const W = base.getWidth(), H = base.getHeight();
  const [ox, oy] = base.getOrigin();
  const [rx, ry] = base.getResolution();
  const seen = new Set();
  const levels = imgs
    .map((im) => ({im, res: (Math.abs(rx) * W) / im.getWidth(), mask: masks.find((m) => m.getWidth() === im.getWidth() && m.getHeight() === im.getHeight()) || null}))
    .sort((a, b) => b.res - a.res)
    .filter((l) => {
      const k = l.res.toPrecision(10);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const TS = 256;
  const extent = [ox, oy + ry * H, ox + rx * W, oy];
  const tileGrid = new TileGrid({extent, origin: [ox, oy], resolutions: levels.map((l) => l.res), tileSize: TS});
  const single = info.bands === 1 && info.photometric !== 3;
  const ramp = rec.ramp || (info.bitsPerSample[0] === 8 ? 'gray' : 'terrain');
  const min = info.stats ? info.stats.min : 0;
  const max = info.stats ? info.stats.max : 255;
  const nodata = info.nodata;

  const source = new TileImage({
    projection: rec.crs,
    tileGrid,
    wrapX: false,
    transition: 0,
    interpolate: true,
    tileUrlFunction: (c) => `${c[0]}/${c[1]}/${c[2]}`,
    tileLoadFunction: (tile) => {
      const [z, x, y] = tile.getTileCoord();
      const {im, mask} = levels[z];
      const x0 = x * TS, y0 = y * TS;
      const x1 = Math.min(x0 + TS, im.getWidth()), y1 = Math.min(y0 + TS, im.getHeight());
      const canvas = document.createElement('canvas');
      canvas.width = TS;
      canvas.height = TS;
      if (x1 <= x0 || y1 <= y0 || x0 < 0 || y0 < 0) {
        tile.setImage(canvas);
        return;
      }
      const w = x1 - x0, h = y1 - y0;
      (async () => {
        const out = new Uint8ClampedArray(TS * TS * 4);
        if (single) {
          const [band] = await im.readRasters({window: [x0, y0, x1, y1], samples: [0]});
          const span = max - min || 1;
          for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
              const v = band[r * w + c];
              const o = (r * TS + c) * 4;
              if (!Number.isFinite(v) || (nodata !== null && nodata !== undefined && v === nodata)) continue;
              const col = rampColor(Math.max(0, Math.min(1, (v - min) / span)), ramp);
              out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 255;
            }
          }
        } else {
          const rgb = await im.readRGB({window: [x0, y0, x1, y1], interleave: true, enableAlpha: true});
          const ch = Math.round(rgb.length / (w * h));
          for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
              const i = (r * w + c) * ch, o = (r * TS + c) * 4;
              out[o] = rgb[i]; out[o + 1] = rgb[i + 1]; out[o + 2] = rgb[i + 2];
              out[o + 3] = ch >= 4 ? rgb[i + 3] : 255;
            }
          }
        }
        if (mask) {
          const [m] = await mask.readRasters({window: [x0, y0, x1, y1], samples: [0]});
          for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) if (!m[r * w + c]) out[(r * TS + c) * 4 + 3] = 0;
          }
        }
        canvas.getContext('2d').putImageData(new ImageData(out, TS, TS), 0, 0);
        tile.setImage(canvas);
      })().catch((e) => {
        console.warn('Tesela no legible', z, x, y, e);
        tile.setState(TileState.ERROR);
      });
    },
  });
  const layer = new TileLayer({source, opacity: rec.opacity ?? 1, visible: rec.visible !== false, preload: 0});
  layer.set('rec', rec);
  layer.set('canvasFallback', true);
  return layer;
}
