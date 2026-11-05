// Capas del mapa: GeoTIFF (ráster) y vectoriales.

import WebGLTileLayer from 'ol/layer/WebGLTile.js';
import GeoTIFFSource from 'ol/source/GeoTIFF.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import {Style, Stroke, Fill, Circle as CircleStyle, Text} from 'ol/style.js';
import {transformExtent} from 'ol/proj.js';
import {fromCustomClient, fromBlob} from 'geotiff';
import './geotiff_patch.js';
import {webglAvailable, makeCanvasRasterLayer} from './raster_canvas.js';
export {webglAvailable};
import {HAS_NATIVE, fileUrl, rangeLoader, customClient} from './native.js';
import {readVector, VIEW_PROJ} from './formats.js';
import {CRS, normalizeCode, isKnown, ensureCrs, crsName} from './crs.js';
import {settings} from './store.js';
import {t, tn, N_, fmtNum} from './i18n.js';

/**
 * Escalas de color para rásteres de una banda. Códigos neutros ('gray', 'terrain'); se aceptan
 * los antiguos guardados en las capas ('gris', 'terreno'). [código, nombre para traducir con t()].
 */
export const RAMP_NAMES = [
  ['gray', N_('Gris (claro = valor alto)')],
  ['terrain', N_('Relieve (azul → rojo)')],
];
/** Código de escala de color normalizado ('gray' | 'terrain' | null). */
export function rampCode(v) {
  if (v === 'gris' || v === 'gray') return 'gray';
  if (v === 'terreno' || v === 'terrain') return 'terrain';
  return null;
}
/** Escala por omisión para un ráster: gris para imágenes de 8 bits, relieve para el resto (MDE). */
export const defaultRamp = (info) => (info.bitsPerSample[0] === 8 ? 'gray' : 'terrain');

export const PALETTE = ['#e6007e', '#00b7ff', '#ff8f00', '#7c4dff', '#00c853', '#ffeb3b', '#212121', '#ffffff'];

// ---------------------------------------------------------------------------
// Estilos vectoriales de alto contraste (halo blanco o negro para leer bien
// sobre fotos aéreas a pleno sol).

const styleCache = new Map();
export function vectorStyle(color, labels, fill = true) {
  return (feature, resolution) => {
    const geomType = feature.getGeometry() ? feature.getGeometry().getType() : 'Point';
    const showLabel = labels && settings.labels && resolution < 0.16;
    const name = showLabel ? String(feature.get('name') ?? feature.get('nombre') ?? '') : '';
    const small = resolution > 0.3;
    const key = `${color}|${geomType}|${name}|${small}|${fill}`;
    let st = styleCache.get(key);
    if (st) return st;
    const halo = color === '#ffffff' || color === '#ffeb3b' ? '#000000' : '#ffffff';
    if (geomType === 'Point' || geomType === 'MultiPoint') {
      st = [
        new Style({
          image: new CircleStyle({radius: small ? 3.5 : 6, fill: new Fill({color}), stroke: new Stroke({color: halo, width: small ? 1.2 : 2}), declutterMode: 'none'}),
          text: name
            ? new Text({text: name, offsetX: 10, textAlign: 'left', font: '600 13px system-ui, sans-serif', fill: new Fill({color: '#000'}), stroke: new Stroke({color: '#fff', width: 4})})
            : undefined,
        }),
      ];
    } else if (geomType.includes('Polygon')) {
      st = [
        new Style({stroke: new Stroke({color: halo, width: 5})}),
        new Style({stroke: new Stroke({color, width: 2.5}), fill: fill ? new Fill({color: hexA(color, 0.12)}) : undefined}),
      ];
    } else {
      st = [new Style({stroke: new Stroke({color: halo, width: 6, lineCap: 'round'})}), new Style({stroke: new Stroke({color, width: 3, lineCap: 'round'})})];
    }
    if (styleCache.size > 2000) styleCache.clear();
    styleCache.set(key, st);
    return st;
  };
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------------------------------------------------------------------
// GeoTIFF

function tiffError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * Lee metadatos del GeoTIFF sin cargar los píxeles (solo cabeceras e IFD).
 * @returns {Promise<object>}
 */
export async function inspectGeoTIFF(src) {
  const tiff = src.blob ? await fromBlob(src.blob) : await fromCustomClient(customClient(src.url), {});
  const count = await tiff.getImageCount();
  const img = await tiff.getImage(0);
  const keys = img.getGeoKeys() || {};
  const fd = img.getFileDirectory();
  const get = (k) => {
    try {
      return typeof fd.getValue === 'function' ? fd.getValue(k) : fd[k];
    } catch {
      return undefined;
    }
  };
  // Validez de la georreferencia (OGC GeoTIFF 1.1, requisito 1.2)
  const tag = async (k) => {
    try {
      return fd.getValue(k);
    } catch {
      try {
        return await fd.loadValue(k);
      } catch {
        return null;
      }
    }
  };
  const tiepoints = await tag('ModelTiepoint');
  const pixelScale = await tag('ModelPixelScale');
  const modelTransform = await tag('ModelTransformation');
  if (!tiepoints && !modelTransform) {
    throw tiffError('NOT_GEOREFERENCED', t('La imagen no tiene ubicación en el mapa (no está georreferenciada). Georreferénciela en QGIS (Ráster → Georreferenciador) y expórtela como GeoTIFF.'));
  }
  if (!modelTransform && (!pixelScale || (tiepoints && tiepoints.length > 6))) {
    throw tiffError('GCP', t('La imagen solo trae puntos de control (GCP) y hay que rectificarla antes de usarla. En QGIS: Ráster → Georreferenciador; o con GDAL: gdalwarp -of COG entrada.tif salida.tif'));
  }
  const comp = get('Compression');
  if ([2, 3, 4, 34712, 52546].includes(comp)) {
    const kind = ({2: 'CCITT', 3: 'CCITT G3', 4: 'CCITT G4', 34712: 'JPEG 2000', 52546: 'JPEG XL'})[comp];
    throw tiffError('COMPRESSION', t('La app no puede leer la compresión {kind} de este GeoTIFF. Conviértalo a COG en QGIS (Exportar → Guardar como, formato COG) o con GDAL: gdal_translate -of COG entrada.tif salida.tif', {kind}));
  }
  let epsg = null;
  if (keys.ProjectedCSTypeGeoKey && keys.ProjectedCSTypeGeoKey !== 32767) epsg = `EPSG:${keys.ProjectedCSTypeGeoKey}`;
  else if (keys.GeographicTypeGeoKey && keys.GeographicTypeGeoKey !== 32767 && keys.GTModelTypeGeoKey === 2) epsg = `EPSG:${keys.GeographicTypeGeoKey}`;
  let bbox = null, res = null;
  try {
    bbox = img.getBoundingBox();
    res = img.getResolution();
  } catch {
    /* sin georreferencia afín */
  }
  // Vistas generales (pirámides) y máscaras internas de GDAL (NewSubfileType con el bit 4):
  // la máscara marca qué píxeles son transparentes, por ejemplo fuera del límite de un área.
  const overviews = [];
  let hasMask = false;
  for (let i = 1; i < count; i++) {
    const o = await tiff.getImage(i);
    let sub = 0;
    try {
      sub = o.getFileDirectory().getValue('NewSubfileType') || 0;
    } catch {
      sub = 0;
    }
    if (sub & 4) hasMask = true;
    else overviews.push([o.getWidth(), o.getHeight()]);
  }
  const nb = img.getSamplesPerPixel();
  const bits = Array.from({length: nb}, (_, i) => img.getBitsPerSample(i));
  const sf = img.getSampleFormat(0);
  let gdalMeta = null;
  try {
    gdalMeta = await img.getGDALMetadata(0);
  } catch {
    gdalMeta = null;
  }
  const nodata = img.getGDALNoData ? img.getGDALNoData() : null;
  let stats = null;
  if (gdalMeta && gdalMeta.STATISTICS_MINIMUM !== undefined) {
    stats = {min: Number(gdalMeta.STATISTICS_MINIMUM), max: Number(gdalMeta.STATISTICS_MAXIMUM)};
  }
  const info = {
    width: img.getWidth(),
    height: img.getHeight(),
    bands: img.getSamplesPerPixel(),
    bitsPerSample: bits,
    sampleFormat: sf || 1,
    photometric: get('PhotometricInterpretation'),
    compression: get('Compression'),
    tiled: img.isTiled,
    tileSize: img.isTiled ? [img.getTileWidth(), img.getTileHeight()] : null,
    overviews,
    epsg,
    geoKeys: keys,
    bbox,
    res,
    nodata,
    hasMask,
    stats,
    pixelIsPoint: keys.GTRasterTypeGeoKey === 2,
  };
  // Para rásteres de una banda no byte (p. ej. MDE en float32) se estima min/max
  // en la pirámide más pequeña para poder aplicar una rampa de color.
  if (info.bands === 1 && !(info.bitsPerSample[0] === 8 && info.sampleFormat === 1) && !stats) {
    try {
      const small = count > 1 ? await tiff.getImage(count - 1) : img;
      if (small.getWidth() * small.getHeight() <= 4e6) {
        const [band] = await small.readRasters({samples: [0]});
        let vals = [];
        const step = Math.max(1, Math.floor(band.length / 200000));
        for (let i = 0; i < band.length; i += step) {
          const v = band[i];
          if (Number.isFinite(v) && (nodata === null || v !== nodata) && v > -1e30) vals.push(v);
        }
        vals.sort((a, b) => a - b);
        if (vals.length) info.stats = {min: vals[Math.floor(vals.length * 0.02)], max: vals[Math.floor(vals.length * 0.98)], estimated: true};
      }
    } catch (e) {
      console.warn('No se pudieron estimar estadísticas', e);
    }
  }
  return info;
}

const RAMPS = {
  terrain: [[0.0, [44, 123, 182]], [0.2, [171, 217, 233]], [0.4, [255, 255, 191]], [0.6, [253, 174, 97]], [0.8, [215, 25, 28]], [1.0, [120, 50, 30]]],
  gray: [[0, [0, 0, 0]], [1, [255, 255, 255]]],
};

function rampExpr(name, band) {
  const stops = [];
  for (const [v, c] of RAMPS[rampCode(name)] || RAMPS.gray) stops.push(v, [...c, 1]);
  return ['interpolate', ['linear'], ['band', band], ...stops];
}

/**
 * Crea la capa para un GeoTIFF (WebGL; sin WebGL, modo compatible en canvas 2D).
 * @param {object} rec registro de capa {file, name, crs, opacity, ramp, ...}
 * @param {object} info resultado de inspectGeoTIFF
 * @param {Blob} [blob] solo en modo web
 */
export async function makeRasterLayer(rec, info, blob) {
  if (rec.crs) ensureCrs(rec.crs);
  if (info.epsg) ensureCrs(info.epsg);
  if (!webglAvailable()) {
    return makeCanvasRasterLayer(rec, info, blob ? {blob} : {url: rec.url || fileUrl(rec.file)});
  }
  const sourceInfo = blob ? {blob} : {url: rec.url || fileUrl(rec.file), loader: rec.url ? undefined : rangeLoader};
  const single = info.bands === 1 && info.photometric !== 3; // 3 = paleta (se convierte a RGB)
  if (single && info.stats) {
    sourceInfo.min = info.stats.min;
    sourceInfo.max = info.stats.max;
  }
  const source = new GeoTIFFSource({
    sources: [sourceInfo],
    convertToRGB: 'auto',
    normalize: true,
    projection: rec.crs && rec.crsOverride ? rec.crs : undefined,
    interpolate: true,
    transition: 0,
  });
  // Con nodata o con máscara interna, OpenLayers agrega una banda alfa al final
  const hasNodata = (info.nodata !== null && info.nodata !== undefined) || !!info.hasMask;
  let style;
  if (single) {
    const alphaBand = hasNodata ? 2 : null;
    const ramp = rampExpr(rampCode(rec.ramp) || defaultRamp(info), 1);
    style = {color: alphaBand ? ['case', ['==', ['band', alphaBand], 0], [0, 0, 0, 0], ramp] : ramp};
  } else {
    const rgbBands = info.photometric === 3 ? 3 : Math.min(info.bands, 4);
    const total = rgbBands + (hasNodata ? 1 : 0);
    const alpha = total >= 4 ? ['band', 4] : 1;
    style = {color: ['array', ['band', 1], ['band', 2], ['band', 3], alpha]};
  }
  const layer = new WebGLTileLayer({source, style, opacity: rec.opacity ?? 1, visible: rec.visible !== false, preload: 1, cacheSize: 256});
  layer.set('rec', rec);
  return layer;
}

/** Decimales para mostrar unas `sig` cifras significativas (0 a 8), sin ceros de más al final. */
function decimalsFor(v, sig = 4) {
  const a = Math.abs(Number(v));
  if (!Number.isFinite(a) || a === 0) return 0;
  let d = Math.max(0, Math.min(8, sig - 1 - Math.floor(Math.log10(a))));
  const r = (x, k) => Math.round(x * 10 ** k) / 10 ** k;
  while (d > 0 && r(a, d - 1) === r(a, d)) d--; // 0,05000 → 0,05
  return d;
}
const fmtSig = (v, sig = 4) => fmtNum(v, decimalsFor(v, sig));

/** ¿Las unidades del SRC son metros? (las definiciones sin +units usan metros) */
function crsInMetres(code) {
  const info = CRS[normalizeCode(code)];
  if (!info || info.geographic) return false;
  return /\+units=m(\s|$)/.test(info.def) || !/\+units=|\+to_meter=/.test(info.def);
}

/**
 * Filas [etiqueta, valor] (ya traducidas) que describen un GeoTIFF. Las filas técnicas, que no
 * hacen falta para usar el mapa, llevan row.tech = true (main.js puede mostrarlas plegadas en
 * «Detalles técnicos»).
 * @returns {string[][]}
 */
export function describeRaster(info) {
  const rows = [];
  const tech = (label, value) => {
    const r = [label, value];
    r.tech = true;
    rows.push(r);
  };
  rows.push([t('Tamaño'), t('{w} × {h} píxeles', {w: fmtNum(info.width), h: fmtNum(info.height)})]);
  const code = normalizeCode(info.epsg);
  rows.push([t('Sistema de coordenadas'), code ? `${code} · ${crsName(code)}` : t('El archivo no lo indica')]);
  if (info.res) {
    const x = Math.abs(info.res[0]), y = Math.abs(info.res[1]);
    const geo = code && CRS[code] && CRS[code].geographic;
    const params = {x: fmtSig(x), y: fmtSig(y)};
    let txt;
    if (geo) txt = t('{x} × {y} grados por píxel', params);
    else if (!code || crsInMetres(code)) txt = Math.abs(x - y) < 1e-9 * Math.max(x, 1) ? t('{x} m por píxel', params) : t('{x} × {y} m por píxel', params);
    else txt = t('{x} × {y} unidades del sistema por píxel', params);
    rows.push([t('Tamaño del píxel'), txt]);
  }
  rows.push([t('Bandas'), tn(info.bands, '{n} banda de {bits} bits', '{n} bandas de {bits} bits', {bits: String(info.bitsPerSample[0])})]);
  if (info.stats) {
    const p = {min: fmtSig(info.stats.min, 5), max: fmtSig(info.stats.max, 5)};
    rows.push([t('Valores'), info.stats.estimated ? t('{min} a {max} (estimado con el 96 % central de los píxeles)', p) : t('{min} a {max}', p)]);
  }
  if (info.hasMask) rows.push([t('Transparencia'), t('Fuera del área de la imagen se ve transparente (máscara interna)')]);
  tech(t('Organización interna'), info.tiled ? t('En teselas de {w} × {h} píxeles', {w: info.tileSize[0], h: info.tileSize[1]}) : t('En franjas (no en teselas)'));
  tech(
    t('Vistas reducidas (pirámides)'),
    info.overviews.length ? tn(info.overviews.length, '{n} nivel ({sizes} píxeles de ancho)', '{n} niveles ({sizes} píxeles de ancho)', {sizes: info.overviews.map((o) => fmtNum(o[0])).join(' · ')}) : t('Ninguna'),
  );
  const COMP = {5: 'LZW', 7: 'JPEG', 8: 'Deflate', 32946: 'Deflate', 32773: 'PackBits', 34887: 'LERC', 50000: 'ZSTD', 50001: 'WebP'};
  tech(t('Compresión'), info.compression === 1 || info.compression === undefined ? t('Ninguna') : COMP[info.compression] || t('Código {n}', {n: String(info.compression)}));
  if (info.nodata !== null && info.nodata !== undefined) tech(t('Valor «sin datos» (nodata)'), String(info.nodata));
  tech(t('Referencia del píxel'), info.pixelIsPoint ? t('Centro del píxel (PixelIsPoint)') : t('Esquina del píxel (PixelIsArea)'));
  return rows;
}

/** Avisos (ya traducidos) para un GeoTIFF recién importado. */
export function rasterWarnings(info, sizeBytes) {
  const w = [];
  if (!info.tiled && info.width * info.height > 4e6) w.push(t('Este GeoTIFF no está guardado en teselas y puede ir lento. Conviértalo a COG en QGIS o con GDAL (vea Ayuda).'));
  if (!info.overviews.length && info.width * info.height > 16e6) w.push(t('Este GeoTIFF no tiene vistas reducidas (pirámides): al alejar el mapa puede ir lento o quedarse sin memoria. Conviértalo a COG (vea Ayuda).'));
  if (sizeBytes > 1.5e9) w.push(t('El archivo es muy grande para un teléfono. Si va lento, recórtelo a la zona de trabajo en QGIS.'));
  return w;
}

/** Extensión del ráster en la proyección del mapa (EPSG:3857). */
export function rasterExtent3857(info, crs) {
  if (!info.bbox || !crs) return null;
  try {
    ensureCrs(crs);
    return transformExtent(info.bbox, crs, VIEW_PROJ);
  } catch {
    return null;
  }
}

export function knownRasterCrs(info) {
  const c = normalizeCode(info.epsg);
  return c && isKnown(c) ? c : null;
}

// ---------------------------------------------------------------------------
// Vectoriales

export async function makeVectorLayer(rec, buf, askCrs) {
  const {features, crs, warnings} = await readVector(rec.file || rec.url || rec.name, buf, askCrs);
  if (!features.length && !rec.editable) {
    const e = new Error(t('El archivo no tiene puntos, líneas ni polígonos. Revise que sea el archivo correcto.'));
    e.code = 'EMPTY';
    throw e;
  }
  features.forEach((f, i) => (f.ordinal = i)); // orden del archivo (la fuente usa el del índice espacial)
  const source = new VectorSource({features});
  const layer = new VectorLayer({
    source,
    style: vectorStyle(rec.color || PALETTE[0], true, !rec.noFill),
    visible: rec.visible !== false,
    opacity: rec.opacity ?? 1,
    declutter: true,
    updateWhileInteracting: true,
  });
  layer.set('rec', rec);
  rec.crs = crs;
  return {layer, warnings, count: features.length};
}

/** Lee el contenido de un archivo importado (modo nativo) o de un recurso empaquetado. */
export async function fetchBuffer(rec) {
  const url = rec.url || fileUrl(rec.file);
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(t('No se pudo leer «{name}» (error {status}). Vuelva a importar el archivo.', {name: rec.name || rec.file || rec.url, status: String(r.status)}));
    e.code = 'READ';
    throw e;
  }
  return r.arrayBuffer();
}

export {HAS_NATIVE};
