// Mapa de Campo: visor GIS de campo, sin conexión, para Android.
// Carga GeoTIFF propios, superpone líneas/puntos y guía en el terreno.

import 'ol/ol.css';
import '../style.css';
import '../css/editor.css';
import '../css/nav.css';
import '../css/plan.css';
import OlMap from 'ol/Map.js'; // «Map» queda para el Map de JavaScript
import View from 'ol/View.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import Attribution from 'ol/control/Attribution.js';
import {defaults as defaultInteractions} from 'ol/interaction/defaults.js';
import {extend, createEmpty, isEmpty} from 'ol/extent.js';
import {transform as olTransform} from 'ol/proj.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import {registerAll, crsName, fromWgs84, utmCodeFor, utmZone, inCostaRica, setPositionHint, unknownCrsHelp} from './crs.js';
import {toDMS, fmtDist, fmtArea, cardinal, sphericalBearing} from './geodesy.js';
import {settings, saveSettings, loadLayers, saveLayers, loadView, saveView, loadNav} from './store.js';
import {$, icon, esc, toast, openSheet, closeSheet, sheetBack, sheetIsOpen, dialog, closeModal, confirmDialog, promptDialog, crsDialog, fmtBytes, fmtTime, KEEP_OPEN} from './ui.js';
import {HAS_NATIVE, call, callJSON, on, detectRangeMode, getRangeMode} from './native.js';
import {kindOf, extOf, toLL, fromLL, toGPX, toGeoJSON, toCSV, cancelled} from './formats.js';
import {PALETTE, RAMP_NAMES, rampCode, defaultRamp, inspectGeoTIFF, makeRasterLayer, describeRaster, rasterWarnings, rasterExtent3857, knownRasterCrs, makeVectorLayer, fetchBuffer, webglAvailable} from './layers.js';
import {Gps, providerLabel} from './gps.js';
import {NavUI} from './navui.js';
import {Measure, Track, Waypoints, averagePosition, lengthLL, areaLL} from './tools.js';
import {Planner} from './planui.js';
import {Basemap, BASEMAPS, GOOGLE_TERMS, GOOGLE_PRIVACY} from './basemap.js';
import {makeConnection, isQgisConnectionsXml, parseQgisConnectionsXml} from './xyz.js';
import {Editor, attrLabel, attrText} from './editor.js';
import {safeFileName} from './editgeo.js';
import {CREDIT_HTML, BIO_HTML} from './about.js';
import {HELP} from './help/index.js';
import {t, tn, N_, fmtNum, fmtDateTime, getLang, setLang, locale, LANGS, translateDom, parseLocaleNumber} from './i18n.js';

const APP_VERSION = '1.5.0';
registerAll();

// ---------------------------------------------------------------------------
// Mapa
// Textos fijos de index.html en el idioma elegido, y tema / tamaño de letra antes de dibujar nada
translateDom();
applyLook();

const saved = loadView();
// Sin vista guardada: EARTH para quien trabaja allí; para el resto, el mundo entero hasta que llegue
// la primera posición GPS (entonces el mapa va a esa posición, ver gps.onChange).
const EARTH_CENTER = [-83.5929, 10.2155];
let centerOnFirstFix = !saved && settings.region !== 'earth';
const view = new View({
  projection: 'EPSG:3857',
  center: saved ? saved.center : settings.region === 'earth' ? fromLL(EARTH_CENTER) : fromLL([0, 15]),
  zoom: saved ? saved.zoom : settings.region === 'earth' ? 17 : 2,
  maxZoom: 24,
  constrainRotation: false,
  enableRotation: true,
});
// Migración: antes solo existía el interruptor de OpenStreetMap
if (settings.basemap === undefined) settings.basemap = settings.osm ? 'osm' : 'none';
const map = new OlMap({
  target: 'map',
  view,
  layers: [],
  controls: [new ScaleLine({units: 'metric', bar: true, steps: 2, text: false, minWidth: 110}), new Attribution({collapsed: true})],
  interactions: defaultInteractions({pinchRotate: false, altShiftDragRotate: false, doubleClickZoom: true}),
  moveTolerance: 4,
});
view.on('change:rotation', () => {
  $('#north').style.transform = `rotate(${view.getRotation()}rad)`;
  $('#north').classList.toggle('rotated', Math.abs(view.getRotation()) > 0.01);
});
map.on('moveend', () => saveView({center: view.getCenter(), zoom: view.getZoom()}));

// Paneles de abajo: en el modo normal, la barra de herramientas (dock) y la de coordenadas; al
// navegar, editar o medir, la tarjeta o barra de esa tarea (el dock y las coordenadas se ocultan).
// --bottom-ui es la altura, desde abajo, del borde superior del panel más alto a la vista: ahí se
// apoyan «Mi ubicación», la escala, la atribución y el logotipo de Google, y el centro del mapa
// («seguir mi posición») se calcula en la zona que queda libre.
const BOTTOM_PANELS = ['dock', 'coordBar', 'navCard', 'measureBar', 'editBar', 'sheet'];
function updatePadding() {
  const card = document.getElementById('navCard');
  const navH = card && !card.hidden ? card.offsetHeight : 0;
  document.documentElement.style.setProperty('--nav-h', `${navH}px`);
  const bottom = updateBottomUi();
  const topbar = document.getElementById('topbar').offsetHeight || 56;
  view.padding = [topbar + 8, 70, bottom + 8, 10];
}
function updateBottomUi() {
  const H = document.documentElement.clientHeight;
  let top = 0;
  for (const id of BOTTOM_PANELS) {
    const el = document.getElementById(id);
    if (!el || el.hidden || !el.offsetHeight || getComputedStyle(el).display === 'none') continue;
    if (id === 'sheet' && (!el.classList.contains('open') || window.innerWidth >= 700)) continue; // en tableta la hoja va al costado
    top = Math.max(top, Math.min(H - 64, H - el.getBoundingClientRect().top + 4));
  }
  top = Math.round(top || 12);
  const sh = document.getElementById('sheet');
  document.body.classList.toggle('sheet-open', !!sh && sh.classList.contains('open') && window.innerWidth < 700);
  document.documentElement.style.setProperty('--bottom-ui', `${top}px`);
  return top;
}
for (const id of BOTTOM_PANELS) {
  const el = document.getElementById(id);
  new ResizeObserver(updatePadding).observe(el);
  new MutationObserver(updatePadding).observe(el, {attributes: true, attributeFilter: ['hidden', 'class']});
}
// Los modos (navigating, editing, measuring) se marcan con clases en <body>
new MutationObserver(updatePadding).observe(document.body, {attributes: true, attributeFilter: ['class']});
document.getElementById('sheet').addEventListener('transitionend', updateBottomUi);
window.addEventListener('resize', updatePadding);

const basemap = new Basemap(map, (msg) => toast(msg, 7000));
function applyBasemap() {
  basemap.xyz = settings.xyz || [];
  if (basemap.isXyz(settings.basemap) && !basemap.xyzFor(settings.basemap)) settings.basemap = 'none';
  if (!basemap.set(settings.basemap, settings.googleKey)) {
    toast(t('Para ver Google Maps escriba su clave de la Map Tiles API en Capas → Mapa base.'), 6000);
  }
}
applyBasemap();

const gps = new Gps(map);
const nav = new NavUI(map, gps);
const measure = new Measure(map);
const track = new Track(map, gps);
const waypoints = new Waypoints(map);
const planner = new Planner({
  map, nav, gps, waypoints,
  saveText: (...a) => saveText(...a),
  utmCode: (ll) => utmCodeFor(ll[0], ll[1]),
  savePlanLayers: (...a) => savePlanLayers(...a),
});

const editor = new Editor({
  map, gps,
  entries: () => layers,
  persist: (entry, text) => persistEdited(entry, text),
  createLayer: (o) => createEditableLayer(o),
  coordsHtml: (ll, z) => allCoordsHtml(ll, z),
  saveText: (...a) => saveText(...a),
  utmCode: (ll) => utmCodeFor(ll[0], ll[1]),
  openPlanner: () => planner.open(),
  onActive: (on) => {
    if (on) {
      if (measure.active) measure.stop();
      if (planner.drawing) planner.stopDraw();
    }
    document.body.classList.toggle('editing', on);
    if (!on) persist();
  },
  onStreaming: () => applyScreen(),
});

// ---------------------------------------------------------------------------
// Registro de capas del usuario
/** @type {{rec:object, layer:any, info?:object, blob?:Blob, error?:string}[]} */
const layers = [];
const blobs = new Map(); // modo web: id → File

let persistWarned = 0;
let restoringLayers = false;
function persist() {
  if (restoringLayers) return true;
  const ok = saveLayers(layers.map((l) => l.rec).filter((r) => HAS_NATIVE || r.url));
  if (ok === false && Date.now() - persistWarned > 60000) {
    persistWarned = Date.now();
    toast(t('No queda espacio para guardar la lista de capas. Exporte sus capas editadas y borre el recorrido grabado si ya no lo necesita.'), 8000);
  }
  updateStartCard();
  return ok !== false;
}

function restack() {
  // El primer elemento de la lista se dibuja encima
  layers.forEach((l, i) => l.layer && l.layer.setZIndex(100 + (layers.length - i)));
}

function nextColor() {
  const used = layers.filter((l) => l.rec.kind === 'vector').map((l) => l.rec.color);
  return PALETTE.find((c) => !used.includes(c)) || PALETTE[layers.length % PALETTE.length];
}

/**
 * Lugar de referencia para sugerir el sistema de coordenadas: la posición GPS o, si no hay, el
 * centro del mapa (si está acercado al menos a nivel de país). Así la sugerencia sirve en
 * cualquier país, no solo en Costa Rica.
 */
function referenceLonLat() {
  if (gps.fix && isFinite(gps.fix.lon) && isFinite(gps.fix.lat)) return [gps.fix.lon, gps.fix.lat];
  if (view.getZoom() >= 5) {
    const c = toLL(view.getCenter());
    if (isFinite(c[0]) && isFinite(c[1])) return c;
  }
  return null;
}

/**
 * Pregunta en qué sistema de coordenadas está un archivo.
 * @param {string} fileName nombre que se muestra
 * @param {{reason: string, hint?: string|null, sample?: number[]|null, unknownCode?: string|null, current?: string|null}} info
 * @returns {Promise<string|null>} el código elegido o null si se cancela
 */
async function askCrsFor(fileName, info) {
  // La coordenada de ejemplo va con punto decimal: es un dato para comparar con otros programas
  const xy = info.sample ? info.sample.map((v) => (Math.abs(v) > 1000 ? v.toFixed(2) : v.toFixed(6))).join(', ') : null;
  const msg = xy ? `${info.reason} ${t('Primera coordenada del archivo: {xy}.', {xy})}` : info.reason;
  return crsDialog(t('¿En qué sistema de coordenadas está «{name}»?', {name: fileName}), msg, null, info.current || null, {
    hint: info.hint || null,
    sample: info.sample || null,
    unknownCode: info.unknownCode || null,
    lonLat: referenceLonLat(),
  });
}

// Nombres de los formatos para la lista de capas (no se traducen)
const FORMAT_NAMES = {geojson: 'GeoJSON', json: 'GeoJSON', kml: 'KML', kmz: 'KMZ', gpx: 'GPX', csv: 'CSV', txt: 'CSV', tif: 'GeoTIFF', tiff: 'GeoTIFF'};

/** Cuántos puntos, líneas y áreas tiene una capa, en palabras («12 puntos · 1 línea»). */
function featureCounts(features) {
  let p = 0, l = 0, a = 0, other = 0;
  for (const f of features) {
    const g = f.getGeometry();
    const type = g ? g.getType() : '';
    if (type === 'Point' || type === 'MultiPoint') p++;
    else if (type === 'LineString' || type === 'MultiLineString') l++;
    else if (type === 'Polygon' || type === 'MultiPolygon') a++;
    else other++;
  }
  const parts = [];
  if (p) parts.push(tn(p, '{n} punto', '{n} puntos'));
  if (l) parts.push(tn(l, '{n} línea', '{n} líneas'));
  if (a) parts.push(tn(a, '{n} área', '{n} áreas'));
  if (other) parts.push(tn(other, '{n} elemento sin forma', '{n} elementos sin forma'));
  return parts.length ? parts.join(' · ') : t('Sin elementos');
}

/** Borra la copia interna de un archivo recién importado que no se pudo abrir (el original no se toca). */
function dropImportedCopy(rec) {
  if (!HAS_NATIVE || !rec.file || rec.url || rec.bundled) return;
  if (layers.some((x) => x.rec !== rec && x.rec.file === rec.file)) return;
  call('deleteFile', rec.file);
}

/**
 * Crea la capa para un registro y la añade al mapa.
 * @param {object} rec {id, kind, name, file?, url?, ...}
 */
async function addRecord(rec, {zoom = false, fresh = false, size = 0} = {}) {
  const entry = {rec, layer: null};
  try {
    if (rec.kind === 'raster') {
      const blob = blobs.get(rec.id);
      const src = blob ? {blob} : {url: rec.url || null};
      if (!blob && !rec.url) src.url = (await import('./native.js')).fileUrl(rec.file);
      const info = await inspectGeoTIFF(src);
      entry.info = info;
      let crs = rec.crsOverride ? rec.crs : knownRasterCrs(info);
      if (!crs) {
        if (!fresh && rec.crs) crs = rec.crs;
        else {
          // Con un código desconocido, el selector ya explica qué hacer (unknownCode)
          crs = await askCrsFor(rec.name, {
            reason: info.epsg ? t('La app necesita saber en qué sistema de coordenadas está la imagen para ponerla en su lugar.') : unknownCrsHelp(null),
            hint: null,
            sample: info.bbox ? [info.bbox[0], info.bbox[1]] : null,
            unknownCode: info.epsg || null,
          });
          if (!crs) throw cancelled();
        }
        rec.crsOverride = true;
      }
      rec.crs = crs;
      entry.layer = await makeRasterLayer(rec, info, blob);
      if (fresh && entry.layer.get('canvasFallback')) toast(t('Este teléfono no permite el dibujo rápido (WebGL): la imagen se dibuja en modo compatible, más lento.'), 5000);
      let readWarned = false;
      entry.layer.getSource().on('change', () => {
        if (readWarned || entry.layer.getSource().getState() !== 'error') return;
        readWarned = true; // un solo aviso por capa
        const err = entry.layer.getSource().getError && entry.layer.getSource().getError();
        toast(err && err.message
          ? t('No se pudo leer «{name}» ({error}). Si sigue sin verse, quite la capa y vuelva a abrir el archivo.', {name: rec.name, error: err.message})
          : t('No se pudo leer «{name}». Si sigue sin verse, quite la capa y vuelva a abrir el archivo.', {name: rec.name}), 6000);
      });
      if (fresh) {
        const w = rasterWarnings(info, size);
        if (w.length) setTimeout(() => dialog(t('Aviso sobre «{name}»', {name: rec.name}), w.map((x) => `<p>${esc(x)}</p>`).join(''), [{label: t('Entendido'), primary: true}]), 600);
      }
      entry.extent = rasterExtent3857(info, crs);
      if (rec.attribution && entry.layer.getSource() && entry.layer.getSource().setAttributions) entry.layer.getSource().setAttributions(esc(rec.attribution));
    } else {
      const blob = blobs.get(rec.id);
      const buf = blob ? await blob.arrayBuffer() : await fetchBuffer(rec);
      if (!rec.color) rec.color = nextColor();
      const r = await makeVectorLayer(rec, buf, (q) => askCrsFor(rec.name, q));
      entry.layer = r.layer;
      entry.count = r.count;
      entry.extent = r.layer.getSource().getExtent();
      if (fresh && r.warnings.length) toast(r.warnings.join(' '), 5000);
    }
    map.addLayer(entry.layer);
  } catch (e) {
    if (e && e.code !== 'CANCELLED') console.error(e);
    entry.error = (e && e.message) || String(e);
    if (fresh) {
      // Cancelar la pregunta del sistema de coordenadas no es un error: no se avisa
      if (!e || e.code !== 'CANCELLED') toast(t('No se pudo abrir «{name}»: {error}', {name: rec.name, error: entry.error}), 7000);
      dropImportedCopy(rec);
      return null;
    }
  }
  if (fresh && rec.kind === 'raster') {
    // Un mapa base nuevo va debajo de las capas vectoriales (encima de los rásteres anteriores)
    const firstRaster = layers.findIndex((l) => l.rec.kind === 'raster');
    layers.splice(firstRaster < 0 ? layers.length : firstRaster, 0, entry);
  } else layers.unshift(entry);
  restack();
  persist();
  if (zoom && entry.extent && !isEmpty(entry.extent)) view.fit(entry.extent, {padding: [80, 40, 160, 40], maxZoom: 20, duration: 400});
  return entry;
}

/**
 * Guarda una capa editada como GeoJSON (WGS 84) dentro de la app. Si la capa
 * venía de otro formato (KML, GPX, CSV) o de un archivo de demostración, la
 * primera vez se crea una copia GeoJSON editable y la capa pasa a usarla.
 */
async function persistEdited(entry, text) {
  const r = entry.rec;
  if (HAS_NATIVE) {
    const inPlace = r.file && !r.url && /\.geojson$/i.test(r.file) && r.editable;
    if (inPlace) {
      if (!call('replaceFile', r.file, text)) throw new Error(t('No se pudo escribir el archivo.'));
    } else {
      // Nombre de archivo con letras de cualquier idioma (no solo las del español)
      const base = safeFileName(r.name, 'layer').slice(0, 60);
      const name = call('writeFile', `${base}_editable.geojson`, text);
      if (!name) throw new Error(t('No se pudo crear la copia editable de la capa. Revise que quede espacio en el teléfono.'));
      const old = r.file;
      r.file = name;
      delete r.url;
      // El archivo viejo se borra recién cuando el registro que apunta al nuevo quedó guardado
      if (old && old !== name && !layers.some((x) => x !== entry && x.rec.file === old)) r.replaced = old;
    }
  } else {
    blobs.set(r.id, new Blob([text], {type: 'application/geo+json'}));
    if (!r.file || !/\.geojson$/i.test(r.file)) r.file = `${safeFileName(r.name, 'layer')}.geojson`;
  }
  r.editable = true;
  r.crs = 'EPSG:4326';
  r.edited = new Date().toISOString();
  entry.count = entry.layer.getSource().getFeatures().length;
  // r.replaced (archivo viejo) se borra en el próximo arranque, cuando el registro leído del disco
  // prueba que el cambio de archivo quedó guardado; si la app se cerrara antes, nada se pierde.
  persist();
  refreshNavPoints(entry);
}

/** Si se está recorriendo esta capa de puntos, el recorrido toma las posiciones editadas. */
function refreshNavPoints(entry) {
  if (nav.mode !== 'points' || !nav.meta || nav.meta.layerId !== entry.rec.id) return;
  const list = pointsOfLayer(entry).map(({ll, name, line}) => ({ll, name, line}));
  if (!list.length) return nav.stop();
  const old = nav.seq;
  const cur = old && old.current ? old.current.name : null;
  const visitedNames = old ? new Set([...old.visited].map((i) => old.points[i] && old.points[i].name)) : new Set();
  const alertedName = old && nav.arrivedAlerted >= 0 && old.points[nav.arrivedAlerted] ? old.points[nav.arrivedAlerted].name : null;
  let idx = cur !== null ? list.findIndex((p) => p.name === cur) : -1;
  if (idx < 0) idx = Math.min(old ? old.index : 0, list.length - 1);
  nav.startPoints(list, nav.meta.name, {layerId: entry.rec.id, startIndex: idx, quiet: true});
  list.forEach((p, i) => visitedNames.has(p.name) && nav.seq.visited.add(i));
  nav.arrivedAlerted = alertedName !== null ? list.findIndex((p) => p.name === alertedName) : -1;
  nav.update(true);
}

/** Capa nueva y vacía, lista para dibujar. */
async function createEditableLayer({name, geomType, color}) {
  const rec = {id: newId(), kind: 'vector', name, visible: true, opacity: 1, color, geomType, editable: true};
  const text = '{"type":"FeatureCollection","features":[]}';
  const base = safeFileName(name, 'layer').slice(0, 60);
  if (HAS_NATIVE) {
    rec.file = call('writeFile', `${base}.geojson`, text);
    if (!rec.file) {
      toast(t('No se pudo crear el archivo de la capa. Revise que quede espacio en el teléfono.'), 5000);
      return null;
    }
  } else {
    rec.file = `${base}.geojson`;
    blobs.set(rec.id, new Blob([text], {type: 'application/geo+json'}));
  }
  const e = await addRecord(rec, {fresh: true});
  if (e) toast(t('Capa nueva: {name}', {name}), 2500);
  return e;
}

function removeEntry(entry) {
  if (editor.active && editor.entry === entry) editor.stop();
  if (entry.layer) map.removeLayer(entry.layer);
  layers.splice(layers.indexOf(entry), 1);
  blobs.delete(entry.rec.id);
  persist();
}

const newId = () => `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// Importación
async function importFromFiles(list) {
  for (const f of list) {
    if (extOf(f.name) === 'xml') {
      await importQgisXml(f);
      continue;
    }
    const kind = kindOf(f.name);
    if (!kind) {
      // El Shapefile es lo que más entregan las instituciones: se explica cómo convertirlo
      const shp = /^(shp|shx|dbf|prj|cpg|zip)$/.test(extOf(f.name));
      toast(shp
        ? t('«{name}» es parte de un Shapefile, que la app no abre. En QGIS, guárdelo como GeoJSON o KML y abra ese archivo aquí.', {name: f.name})
        : t('No se puede abrir «{name}». Elija un GeoTIFF, KML/KMZ, GeoJSON, GPX o CSV.', {name: f.name}), 7000);
      if (f.file && HAS_NATIVE) call('deleteFile', f.file);
      continue;
    }
    const rec = {id: newId(), kind, name: f.name.replace(/\.[^.]+$/, ''), file: f.file || f.name, visible: true, opacity: 1};
    if (f.blob) blobs.set(rec.id, f.blob);
    const e = await addRecord(rec, {zoom: true, fresh: true, size: f.size});
    if (!e) continue;
    if (e.count) toast(tn(e.count, 'Capa agregada: {name} ({n} elemento)', 'Capa agregada: {name} ({n} elementos)', {name: rec.name}));
    else toast(t('Capa agregada: {name}', {name: rec.name}));
  }
}

/** XML de «Guardar conexiones» de QGIS (XYZ Tiles) → mapas base XYZ de la app. */
async function importQgisXml(f) {
  try {
    const text = f.blob ? await f.blob.text() : new TextDecoder().decode(await fetchBuffer({file: f.file}));
    if (!isQgisConnectionsXml(text)) throw new Error(t('Este XML no es una lista de conexiones XYZ exportada desde QGIS.'));
    const found = parseQgisConnectionsXml(text);
    settings.xyz = settings.xyz || [];
    const added = [];
    let skipped = found.skipped || 0;
    for (const c of found) {
      if (settings.xyz.some((x) => x.url === c.url)) continue;
      try {
        const conn = makeConnection({name: c.name, input: c.url, zmin: c.zmin, zmax: c.zmax});
        settings.xyz.push(conn);
        added.push(conn);
      } catch {
        skipped++;
      }
    }
    // Frases completas, una tras otra (no se arman con pedazos)
    const skippedTxt = skipped ? tn(skipped, 'Se omitió {n} conexión que no sirve: debe usar https y tener {x}, {y} y {z}.', 'Se omitieron {n} conexiones que no sirven: deben usar https y tener {x}, {y} y {z}.') : '';
    let msg;
    if (added.length) {
      settings.basemap = `xyz:${added[0].id}`;
      saveSettings();
      applyBasemap();
      msg = tn(added.length, 'Mapa base XYZ agregado desde QGIS: {names}. Para cambiarlo, vaya a Capas → Mapa base.', 'Mapas base XYZ agregados desde QGIS: {names}. Para cambiarlo, vaya a Capas → Mapa base.', {names: added.map((c) => c.name).join(', ')});
    } else msg = t('No se agregó ninguna conexión: ya estaban en la app.');
    toast(skippedTxt ? `${msg} ${skippedTxt}` : msg, 8000);
  } catch (e) {
    toast(t('No se pudo leer «{name}»: {error}', {name: f.name, error: e.message}), 6000);
  } finally {
    if (f.file && HAS_NATIVE) call('deleteFile', f.file); // el XML no es una capa: no se guarda
  }
}

/**
 * Agregar o editar un mapa base XYZ, igual que «XYZ Tiles → Nueva conexión» en QGIS.
 * @param {object} [existing] conexión a editar
 */
async function xyzDialog(existing, draft) {
  const v = draft || existing || {};
  const conn = await dialog(
    existing ? t('Editar mapa base XYZ') : t('Nuevo mapa base XYZ'),
    `<p class="muted text-sm">${esc(t('Para expertos: agregue un servidor de imágenes en línea, igual que «XYZ Tiles» en QGIS.'))}</p>
     <label class="field"><span>${esc(t('Nombre'))}</span><input id="xyName" type="text" maxlength="60" value="${esc(v.name || '')}" placeholder="${esc(t('Por ejemplo: Ortofoto de la finca'))}"></label>
     <label class="field"><span>${esc(t('Dirección (URL) con {x}, {y} y {z}'))}</span><textarea id="xyUrl" rows="3" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="https://servidor/{z}/{x}/{y}.png">${esc(v.input || v.url || '')}</textarea>
       <small>${t('Pegue la misma URL que usa en QGIS (Navegador → XYZ Tiles → Nueva conexión). También sirve la «fuente» de una capa XYZ de QGIS (<code>type=xyz&amp;url=…</code>) o el texto del XML de «Guardar conexiones». Marcadores: {x} {y} {-y} {z} {q} {s} {a-c} {0-3}. Solo https://.')}</small></label>
     <div class="grid2">
       <label class="field"><span>${esc(t('Zoom mínimo'))}</span><input id="xyMin" type="text" inputmode="numeric" autocomplete="off" value="${esc(v.zmin ?? '')}" placeholder="0"></label>
       <label class="field"><span>${esc(t('Zoom máximo'))}</span><input id="xyMax" type="text" inputmode="numeric" autocomplete="off" value="${esc(v.zmax ?? '')}" placeholder="19"></label>
     </div>
     <label class="field"><span>${esc(t('Atribución (el texto que exige el proveedor)'))}</span><input id="xyAttr" type="text" maxlength="200" value="${esc(v.attribution || '')}" placeholder="${esc(t('© Proveedor'))}"></label>
     <p class="muted text-sm">${esc(t('Use solo servidores cuyas condiciones le permitan usar sus imágenes en esta app. Estas imágenes solo se ven con internet.'))}</p>
     <p id="xyErr" class="note bad" role="alert" hidden></p>`,
    [
      {label: t('Cancelar'), value: null},
      {
        label: t('Guardar'),
        primary: true,
        // Si algo no sirve, el aviso queda en el mismo diálogo y se puede corregir
        value: (w) => {
          const val = (id) => w.querySelector(id).value;
          try {
            return makeConnection({name: val('#xyName'), input: val('#xyUrl'), zmin: val('#xyMin').trim(), zmax: val('#xyMax').trim(), attribution: val('#xyAttr')}, existing && existing.id);
          } catch (e) {
            const box = w.querySelector('#xyErr');
            box.textContent = e.message;
            box.hidden = false;
            return KEEP_OPEN;
          }
        },
      },
    ],
  );
  if (!conn) return null;
  settings.xyz = settings.xyz || [];
  const i = settings.xyz.findIndex((x) => x.id === conn.id);
  if (i >= 0) settings.xyz[i] = conn;
  else settings.xyz.push(conn);
  settings.basemap = `xyz:${conn.id}`;
  saveSettings();
  applyBasemap();
  toast(t('Mapa base: {name}', {name: conn.name}), 3000);
  return conn;
}

function startImport() {
  if (HAS_NATIVE) {
    call('importFiles');
  } else {
    const inp = $('#fileInput');
    inp.value = '';
    inp.onchange = () => importFromFiles(Array.from(inp.files).map((f) => ({name: f.name, blob: f, size: f.size})));
    inp.click();
  }
}

on('onImportProgress', (name, done, total) => {
  const el = $('#progress');
  el.hidden = false;
  el.querySelector('span').textContent = total > 0
    ? t('Copiando «{name}» a la app… {p} %', {name, p: fmtNum(Math.round((100 * done) / total), 0)})
    : t('Copiando «{name}» a la app… {size}', {name, size: fmtBytes(done)});
  el.querySelector('i').style.width = total > 0 ? `${(100 * done) / total}%` : '30%';
});
on('onImportDone', (json) => {
  $('#progress').hidden = true;
  const res = typeof json === 'string' ? JSON.parse(json) : json;
  if (res.error) toast(res.error, 7000); // ya viene traducido desde Android
  if (res.files && res.files.length) importFromFiles(res.files.map((f) => ({name: f.name, file: f.name, size: f.size})));
});
// Android avisa «cancelado» (en el idioma de la app) si se cierra el selector sin elegir: no es un error
const SAVE_CANCELLED = new Set(['cancelled', 'canceled', 'cancelado', 'annulé']); // i18n-ok
on('onSaveDone', (ok, msg) => {
  if (ok) return toast(t('Archivo guardado: {name}', {name: msg}), 4000);
  if (SAVE_CANCELLED.has(String(msg || '').trim().toLowerCase())) return;
  toast(t('No se pudo guardar el archivo ({error}). Pruebe con otra carpeta o libere espacio en el teléfono.', {error: msg}), 7000);
});

/** Guarda texto en un archivo elegido por el usuario (Android) o lo descarga (web). */
function saveText(name, mime, text) {
  if (HAS_NATIVE) {
    call('saveText', name, mime, text);
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], {type: mime}));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
}

/**
 * Guarda un plan como capas vectoriales persistentes (archivos GeoJSON dentro
 * de la app en Android; en el navegador, solo en memoria).
 */
async function savePlanLayers(name, linesJson, pointsJson) {
  const stamp = fileStamp();
  const out = {};
  try {
    out.linesId = await addGeoJsonLayer(`plan_${stamp}_lineas.geojson`, linesJson, {name: t('{plan} · líneas', {plan: name}), color: '#00838f'});
    if (!out.linesId) throw new Error(t('El plan no se pudo guardar como capa. Pruebe otra vez.'));
    if (pointsJson) out.pointsId = await addGeoJsonLayer(`plan_${stamp}_puntos.geojson`, pointsJson, {name: t('{plan} · puntos', {plan: name}), color: '#ff6d00'});
    toast(pointsJson ? t('Plan guardado como dos capas (líneas y puntos): «{name}».', {name}) : t('Plan guardado como capa: «{name}».', {name}), 4000);
  } catch (e) {
    toast(e.message, 6000);
  }
  return out;
}

/** Fecha y hora para nombres de archivo (AAAA-MM-DD-hh-mm, igual en todos los idiomas). */
function fileStamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

/**
 * Guarda un GeoJSON como capa nueva dentro de la app (en Android, como archivo; en el navegador,
 * en memoria) y la agrega al mapa. Devuelve el id de la capa, o null si no se pudo abrir.
 */
async function addGeoJsonLayer(file, text, {name, color}) {
  const rec = {id: newId(), kind: 'vector', name, visible: true, opacity: 1, color: color || nextColor()};
  if (HAS_NATIVE) {
    const saved = call('writeFile', file, text);
    if (!saved) throw new Error(t('No se pudo guardar la capa en la app. Revise que quede espacio en el teléfono.'));
    rec.file = saved;
  } else {
    rec.file = file;
    blobs.set(rec.id, new Blob([text], {type: 'application/geo+json'}));
  }
  const e = await addRecord(rec, {});
  return e && !e.error ? rec.id : null;
}

// ---------------------------------------------------------------------------
// Coordenadas
const projFns = {
  utm: (ll) => {
    const code = utmCodeFor(ll[0], ll[1]);
    const [e, n] = fromWgs84(code, ll);
    return {zone: `${utmZone(ll[0])}${ll[1] >= 0 ? 'N' : 'S'}`, e, n, code};
  },
  crtm05: (ll) => (inCostaRica(ll[0], ll[1]) ? fromWgs84('EPSG:8908', ll) : null),
};

/**
 * Coordenadas de un punto en el formato elegido. Siempre con punto decimal y sin separador de miles
 * (se copian a otros programas). Con wrap = true, este y norte van en dos líneas (barra de coordenadas).
 */
function coordLines(ll, fmt = settings.coordFormat, wrap = false) {
  const [lon, lat] = ll;
  const sep = wrap ? '\n' : '  ';
  if (fmt === 'dms') return `${toDMS(lat, true)}${sep}${toDMS(lon, false)}`;
  if (fmt === 'utm' || ((fmt === 'crtm05' || fmt === 'crtm05cr05') && !inCostaRica(lon, lat))) {
    const u = projFns.utm(ll);
    return `E ${u.e.toFixed(2)}${sep}N ${u.n.toFixed(2)}`;
  }
  if (fmt === 'crtm05' || fmt === 'crtm05cr05') {
    const [e, n] = fromWgs84(fmt === 'crtm05' ? 'EPSG:8908' : 'EPSG:5367', ll);
    return `E ${e.toFixed(2)}${sep}N ${n.toFixed(2)}`;
  }
  return `${lat.toFixed(7)}, ${lon.toFixed(7)}`;
}

/** Nombre corto del formato para la barra de coordenadas (UTM con su zona). */
function coordFormatShort(ll, fmt = settings.coordFormat) {
  if (fmt === 'utm' || ((fmt === 'crtm05' || fmt === 'crtm05cr05') && !inCostaRica(ll[0], ll[1]))) return `UTM ${projFns.utm(ll).zone} · WGS 84`;
  if (fmt === 'crtm05') return 'CRTM05 · CR-SIRGAS';
  if (fmt === 'crtm05cr05') return 'CRTM05 · CR05';
  if (fmt === 'dms') return t('WGS 84 · grados, minutos, segundos');
  return t('WGS 84 · grados decimales');
}

// Formatos de coordenadas. Los de CRTM05 solo tienen sentido en Costa Rica: fuera del país se
// muestra UTM.
const FORMATS = [
  ['dd', N_('Grados decimales (WGS 84)')],
  ['dms', N_('Grados, minutos y segundos (WGS 84)')],
  ['utm', N_('UTM (zona automática, WGS 84)')],
  ['crtm05', N_('CRTM05 CR-SIRGAS (Costa Rica)')],
  ['crtm05cr05', N_('CRTM05 CR05 (Costa Rica)')],
];

function allCoordsHtml(ll, alt) {
  const rows = [
    [t('WGS 84, grados decimales'), `${ll[1].toFixed(8)}, ${ll[0].toFixed(8)}`],
    [t('WGS 84, grados, minutos y segundos'), `${toDMS(ll[1], true)} ${toDMS(ll[0], false)}`],
  ];
  const u = projFns.utm(ll);
  rows.push([`UTM ${u.zone} (${u.code})`, `E ${u.e.toFixed(3)}  N ${u.n.toFixed(3)}`]);
  if (inCostaRica(ll[0], ll[1])) {
    const c = fromWgs84('EPSG:8908', ll), c5 = fromWgs84('EPSG:5367', ll);
    rows.push(['CRTM05 CR-SIRGAS (EPSG:8908)', `E ${c[0].toFixed(3)}  N ${c[1].toFixed(3)}`]);
    rows.push(['CRTM05 CR05 (EPSG:5367)', `E ${c5[0].toFixed(3)}  N ${c5[1].toFixed(3)}`]);
  }
  if (alt !== undefined && alt !== null && isFinite(alt)) rows.push([t('Altura elipsoidal (WGS 84)'), `${alt.toFixed(1)} m`]);
  return `<table class="kv">${rows.map((r) => `<tr><th>${esc(r[0])}</th><td class="mono sel">${esc(r[1])}</td></tr>`).join('')}</table>`;
}

function copyText(text) {
  if (call('copyText', text) === null) navigator.clipboard && navigator.clipboard.writeText(text).catch(() => {});
  toast(t('Coordenadas copiadas'));
}

// ---------------------------------------------------------------------------
// Barra superior, indicador GPS y barra de coordenadas
function updateGpsUi() {
  const chip = $('#gpsChip');
  const q = gps.quality();
  chip.className = `chip q-${q}`;
  const f = gps.fix;
  // Precisión con su unidad (m o ft, según Ajustes → Unidades)
  const acc = !f ? '—' : settings.units === 'imperial' ? fmtDist(f.acc) : `${f.acc < 10 ? fmtNum(f.acc, 1) : fmtNum(Math.round(f.acc), 0)} m`;
  let txt;
  if (gps.sim) txt = t('Simulación ±{acc}', {acc});
  else if (gps.permission === 'denied') txt = t('Sin permiso de ubicación');
  else if (gps.providerEnabled === false) txt = t('Ubicación apagada');
  else if (!gps.running && !f) txt = t('Activar GPS');
  else if (!f) txt = t('Buscando GPS…');
  else if (q === 'stale') txt = t('Sin señal ({s} s)', {s: Math.round((Date.now() - f.receivedAt) / 1000)});
  else if (gps.permission === 'approximate') txt = t('±{acc} · aproximada', {acc});
  else txt = `±${acc}`;
  chip.querySelector('span').textContent = txt;
  chip.setAttribute('aria-label', `${t('Estado del GPS')}: ${txt}`);
  const bar = $('#coordBar');
  if (f) {
    bar.querySelector('.cb-main').textContent = coordLines([f.lon, f.lat], settings.coordFormat, settings.coordFormat !== 'dd');
    bar.querySelector('.cb-sub').textContent = coordFormatShort([f.lon, f.lat]);
  } else {
    bar.querySelector('.cb-main').textContent = t('Sin posición');
    bar.querySelector('.cb-sub').textContent = !HAS_NATIVE
      ? t('Modo navegador (pruebas)')
      : gps.permission === 'denied'
        ? t('Toque «Mi ubicación» para dar permiso')
        : gps.running ? t('Salga a cielo abierto y espere la señal') : t('Toque «Mi ubicación» para usar el GPS');
  }
}

let followMode = 'off'; // off | follow | compass
let locateStateTimer = null;
function setFollow(mode) {
  followMode = mode;
  const b = $('#btnLocate');
  b.classList.toggle('active', mode !== 'off');
  b.innerHTML = icon(mode === 'compass' ? 'compass' : mode === 'follow' ? 'follow' : 'locate');
  const label = mode === 'compass' ? t('Mapa girado según el rumbo') : mode === 'follow' ? t('Siguiendo mi posición') : t('Mi ubicación');
  b.setAttribute('aria-label', label);
  // Etiqueta breve junto al botón, para saber en qué modo quedó
  const st = $('#locateState');
  if (mode !== 'off') {
    st.textContent = mode === 'compass' ? t('Brújula') : t('Seguir');
    st.hidden = false;
    clearTimeout(locateStateTimer);
    locateStateTimer = setTimeout(() => (st.hidden = true), 2000);
  } else st.hidden = true;
  if (mode !== 'compass' && Math.abs(view.getRotation()) > 0.001 && mode === 'follow') view.animate({rotation: 0, duration: 250});
  applyFollow(true);
}

function applyFollow(animate = false) {
  const f = gps.fix;
  if (!f || followMode === 'off') return;
  const c = fromLL([f.lon, f.lat]);
  const opts = {center: c, duration: animate ? 300 : 200};
  if (followMode === 'compass') {
    const h = gps.displayHeading();
    if (h) opts.rotation = (-h.deg * Math.PI) / 180;
  }
  if (animate && view.getZoom() < 17) opts.zoom = 18;
  view.animate(opts);
}

let lastHeadingApply = 0;
gps.onChange((type) => {
  if (type === 'fix') {
    updateGpsUi();
    // El selector de sistemas de coordenadas sugiere los del lugar donde está la persona
    if (gps.fix && !gps.sim) setPositionHint([gps.fix.lon, gps.fix.lat]);
    // Primera vez fuera de EARTH: el mapa va a donde está la persona
    if (centerOnFirstFix && gps.fix && gps.quality() !== 'stale') {
      centerOnFirstFix = false;
      view.animate({center: fromLL([gps.fix.lon, gps.fix.lat]), zoom: 16, duration: 600});
    }
    applyFollow();
    planner.onFix();
  } else if (type === 'heading' && followMode === 'compass' && Date.now() - lastHeadingApply > 250) {
    lastHeadingApply = Date.now();
    const h = gps.displayHeading();
    if (h) view.animate({rotation: (-h.deg * Math.PI) / 180, duration: 200});
  } else if (type !== 'heading') updateGpsUi();
  if (sheetIsOpen() && $('#gpsDetail')) renderGpsDetail(); // también permiso, simulación y señal perdida
});
map.on('pointerdrag', () => {
  if (followMode !== 'off') setFollow('off');
  centerOnFirstFix = false;
});

// ---------------------------------------------------------------------------
// Paneles
function menuSheet() {
  const tile = (a, ic, title, sub) => `<button class="tile" data-a="${a}">${icon(ic)}<span>${title}${sub ? `<small>${sub}</small>` : ''}</span></button>`;
  const body = openSheet(
    t('Menú'),
    `<div class="menu-grid">
      ${tile('import', 'folder', t('Abrir un mapa o datos'), t('GeoTIFF, KML, GeoJSON, GPX, CSV'))}
      ${tile('layers', 'layers', t('Capas'), t('Ver, ordenar y mapas base'))}
      ${tile('edit', 'pencil', t('Editar capas'), t('Dibujar, mover y borrar'))}
      ${tile('plan', 'route', t('Planificar'), t('Líneas o cuadrícula de puntos'))}
      ${tile('wps', 'pin', t('Mis puntos'), tn(waypoints.list.length, '{n} punto marcado', '{n} puntos marcados'))}
      ${tile('track', 'recRing', t('Grabar recorrido'), track.recording ? t('Grabando ahora') : t('Su camino con el GPS'))}
      ${tile('gps', 'sat', t('Estado del GPS'), t('Precisión y satélites'))}
      ${tile('settings', 'gear', t('Ajustes'), t('Idioma, tema, unidades'))}
      ${tile('help', 'help', t('Ayuda'), t('Cómo usar cada herramienta'))}
      ${tile('about', 'info', t('Acerca de'), t('Versión, créditos y privacidad'))}
    </div>`,
  );
  body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    ({layers: layersSheet, import: startImport, edit: () => editor.chooser(), plan: () => (editor.active ? editor.stop().then(() => planner.open()) : planner.open()), wps: waypointsSheet, track: trackSheet, gps: gpsSheet, settings: settingsSheet, help: helpSheet, about: aboutSheet})[a.dataset.a]();
  });
}

// Estilos en línea para piezas que style.css no tiene: etiqueta de origen, secciones plegables y
// botones de fila sin fondo.
const PILL = 'style="flex:none;display:inline-block;padding:1px 8px;margin-inline-end:6px;border-radius:999px;border:1px solid var(--outline);color:var(--on-surface);font-size:0.75rem;font-weight:700;line-height:1.5"';
const DETAILS = 'style="border:var(--border-w) solid var(--divider);border-radius:var(--r-md);padding:0 12px;margin:12px 0;background:var(--surface-2)"';
const SUMMARY = 'style="min-height:48px;display:flex;align-items:center;font-weight:700;cursor:pointer"';
const ROW_BTN = 'style="background:none;border:0;text-align:start;color:inherit"';

// Nombres de los colores de capa (para el lector de pantalla y para no depender solo del color)
const SWATCH_NAMES = {
  '#e6007e': N_('Magenta'), '#00b7ff': N_('Celeste'), '#ff8f00': N_('Naranja'), '#7c4dff': N_('Morado'),
  '#00c853': N_('Verde'), '#ffeb3b': N_('Amarillo'), '#212121': N_('Negro'), '#ffffff': N_('Blanco'),
};
/** Negro o blanco, lo que se lea mejor sobre un color (para la marca ✓ de la muestra elegida). */
function inkOn(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  if (!Number.isFinite(n)) return '#000';
  const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.35 ? '#000' : '#fff';
}

/** Porcentaje con el formato del idioma (30 %, 30%). */
const pct = (v) => t('{p} %', {p: fmtNum(v, 0)});

/** Etiqueta corta de origen: datos de ejemplo, u ortofotos y límite incluidos de EARTH. */
function layerBadge(r) {
  if (r.demo) return `<span ${PILL}>${esc(t('Ejemplo'))}</span>`;
  if (r.bundled) return `<span ${PILL}>${esc(t('EARTH, Costa Rica'))}</span>`;
  return '';
}

/** Qué tiene la capa, en palabras («Imagen · GeoTIFF», «120 puntos · KML»). */
function layerSummary(l) {
  const r = l.rec;
  if (l.error) return t('No se pudo abrir. Toque para ver qué hacer.');
  const fmt = r.kind === 'raster' ? 'GeoTIFF' : FORMAT_NAMES[extOf(r.file || r.url || '')] || '';
  const what = r.kind === 'raster' ? t('Imagen') : l.layer ? featureCounts(l.layer.getSource().getFeatures()) : '';
  return [what, fmt].filter(Boolean).join(' · ');
}

function layersSheet() {
  const rows = layers
    .map((l, i) => {
      const r = l.rec;
      const shown = r.visible !== false;
      const swatch = r.kind === 'vector' ? `<i class="swatch" style="background:${esc(r.color || '#888888')}" aria-hidden="true"></i>` : icon('layers');
      return `<div class="layer-row ${l.error ? 'err' : ''}" data-i="${i}">
        <button type="button" class="icon-btn" data-act="vis" aria-pressed="${shown}" aria-label="${esc(shown ? t('Ocultar «{name}»', {name: r.name}) : t('Mostrar «{name}»', {name: r.name}))}">${icon(shown ? 'eye' : 'eyeOff')}</button>
        <button type="button" class="layer-main" data-act="info" ${ROW_BTN}>
          <span class="layer-name" style="${shown ? '' : 'opacity:.6'}">${swatch}${esc(r.name)}</span>
          <span class="layer-sub" style="display:block">${layerBadge(r)}${esc(layerSummary(l))}</span>
        </button>
        ${l.extent && !isEmpty(l.extent) ? `<button type="button" class="icon-btn" data-act="zoom" aria-label="${esc(t('Ver toda la capa «{name}»', {name: r.name}))}">${icon('zoom')}</button>` : ''}
      </div>`;
    })
    .join('');
  // Botón para recuperar las ortofotos de EARTH quitadas (la instalación está en Ajustes)
  const missing = settings.region === 'earth' ? missingBundled() : [];
  const xyzList = settings.xyz || [];
  const opt = (k, n) => `<option value="${esc(k)}" ${settings.basemap === k ? 'selected' : ''}>${esc(n)}</option>`;
  const plainOpts = BASEMAPS.filter(([k]) => !k.startsWith('g-')).map(([k, n]) => opt(k, n)).join('');
  const googleOpts = BASEMAPS.filter(([k]) => k.startsWith('g-')).map(([k, n]) => opt(k, n)).join('');
  const xyzOpts = xyzList.map((c) => opt(`xyz:${c.id}`, `XYZ · ${c.name}`)).join('');
  const body = openSheet(
    t('Capas'),
    `<button type="button" class="btn primary block big" data-act="import">${icon('folder')}${esc(t('Abrir archivo'))}</button>
     <p class="muted text-sm" style="margin:6px 0 0">${esc(t('GeoTIFF, KML/KMZ, GeoJSON, GPX o CSV. Se guardan en el teléfono y funcionan sin conexión.'))}</p>
     <div class="section-title">${esc(t('Mis capas'))}</div>
     ${rows
    ? `<p class="muted text-sm" style="margin:0 0 4px">${esc(t('La de arriba se dibuja encima. Toque una capa para ver sus opciones: color, transparencia, orden o quitarla.'))}</p>${rows}`
    : `<p class="note info">${esc(t('Todavía no hay capas. Toque «Abrir archivo» para cargar un mapa o datos de su teléfono.'))}</p>`}
     ${missing.length ? `<div class="row-actions"><button type="button" class="btn tonal small" data-act="ortho">${icon('download')}${esc(tn(missing.length, 'Volver a agregar la ortofoto de EARTH', 'Volver a agregar las {n} ortofotos de EARTH'))}</button></div>` : ''}
     <div class="section-title">${esc(t('Mapa base'))}</div>
     <p class="muted text-sm" style="margin:0">${esc(t('Un mapa del mundo debajo de sus capas, para orientarse. Necesita internet: sin señal solo se ven sus propias capas.'))}</p>
     <label class="field"><select id="baseSel" aria-label="${esc(t('Mapa base'))}">
       ${plainOpts}
       <optgroup label="${esc(t('Google: necesita su propia clave (avanzado)'))}">${googleOpts}</optgroup>
       ${xyzList.length ? `<optgroup label="${esc(t('Mis mapas base XYZ'))}">${xyzOpts}</optgroup>` : ''}
     </select></label>
     <div id="gkeyBox" ${String(settings.basemap).startsWith('g-') ? '' : 'hidden'}>
       <label class="field"><span>${esc(t('Clave de Google Maps Platform (Map Tiles API)'))}</span><input id="gkey" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(settings.googleKey || '')}" placeholder="AIza…"></label>
       <p class="muted text-sm">${esc(t('Google exige una clave propia con la Map Tiles API activada y facturación (tiene un cupo mensual gratuito). Sus imágenes solo se ven con internet: sus condiciones no permiten guardarlas para usarlas sin conexión. Para trabajar sin señal, use su propio GeoTIFF.'))}</p>
       <p class="muted text-sm">${t('Al usar Google Maps se aplican las <a href="{terms}">Condiciones adicionales de Google Maps</a> y la <a href="{privacy}">Política de privacidad de Google</a>.', {terms: GOOGLE_TERMS, privacy: GOOGLE_PRIVACY})}</p>
     </div>
     <div id="xyzBox" ${basemap.xyzFor(settings.basemap) ? '' : 'hidden'}>${xyzBoxHtml()}</div>
     <div class="row-actions"><button type="button" class="btn text small" data-act="xyzAdd">${icon('plus')}${esc(t('Agregar un mapa base XYZ (avanzado)'))}</button></div>`,
  );
  body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'import') return startImport();
    if (btn.dataset.act === 'ortho') {
      closeSheet();
      return installEarthPack({zoom: true});
    }
    if (btn.dataset.act === 'xyzAdd') return xyzDialog().then((c) => c && layersSheet());
    if (btn.dataset.act === 'xyzEdit') {
      const c = basemap.xyzFor(settings.basemap);
      return c && xyzDialog(c, {...c, input: c.url}).then((r) => r && layersSheet());
    }
    if (btn.dataset.act === 'xyzDel') {
      const c = basemap.xyzFor(settings.basemap);
      if (!c) return;
      return confirmDialog(t('Quitar mapa base'), t('¿Quitar «{name}» de la lista? Puede volver a agregarlo con su URL.', {name: c.name}), t('Quitar'), true).then((ok) => {
        if (!ok) return;
        settings.xyz = (settings.xyz || []).filter((x) => x.id !== c.id);
        settings.basemap = 'none';
        saveSettings();
        applyBasemap();
        layersSheet();
      });
    }
    const row = e.target.closest('[data-i]');
    if (!row) return;
    const l = layers[Number(row.dataset.i)];
    if (!l) return;
    const act = btn.dataset.act;
    if (act === 'vis') {
      l.rec.visible = l.rec.visible === false;
      l.layer && l.layer.setVisible(l.rec.visible);
      persist();
      layersSheet();
    } else if (act === 'zoom') zoomToLayer(l);
    else if (act === 'info') layerDetail(l);
  });
  $('#baseSel').onchange = (e) => {
    settings.basemap = e.target.value;
    saveSettings();
    const google = settings.basemap.startsWith('g-');
    $('#gkeyBox').hidden = !google;
    applyBasemap();
    $('#xyzBox').hidden = !basemap.xyzFor(settings.basemap);
    $('#xyzBox').innerHTML = xyzBoxHtml();
    if (google && !settings.googleKey) $('#gkey').focus();
  };
  $('#gkey').onchange = (e) => {
    settings.googleKey = e.target.value.trim();
    saveSettings();
    applyBasemap();
  };
}

function zoomToLayer(l) {
  if (!l.extent || isEmpty(l.extent)) return toast(t('Esta capa todavía no tiene nada que mostrar en el mapa.'));
  closeSheet();
  view.fit(l.extent, {padding: [80, 40, 160, 40], maxZoom: 20, duration: 400});
}

function xyzBoxHtml() {
  const c = basemap.xyzFor(settings.basemap);
  if (!c) return '';
  return `<table class="kv"><tr><th>${esc(t('Dirección (URL)'))}</th><td class="mono break">${esc(c.url)}</td></tr><tr><th>${esc(t('Niveles de zoom'))}</th><td>${esc(t('{min} a {max} (más cerca, se amplía la última imagen)', {min: c.zmin, max: c.zmax}))}</td></tr>${c.attribution ? `<tr><th>${esc(t('Atribución'))}</th><td>${esc(c.attribution)}</td></tr>` : ''}</table>
    <div class="row-actions"><button type="button" class="btn small" data-act="xyzEdit">${icon('pencil')}${esc(t('Editar'))}</button><button type="button" class="btn small danger" data-act="xyzDel">${icon('trash')}${esc(t('Quitar'))}</button></div>
    <p class="muted text-sm">${esc(t('Solo se ve con internet. Usted es responsable de respetar las condiciones de uso de este servidor.'))}</p>`;
}

function layerDetail(l) {
  const r = l.rec;
  const i = layers.indexOf(l);
  const feats = r.kind === 'vector' && l.layer ? l.layer.getSource().getFeatures() : [];
  const lines = feats.filter((f) => f.getGeometry() && /Line|Polygon/.test(f.getGeometry().getType()));
  const pts = feats.filter((f) => f.getGeometry() && f.getGeometry().getType() === 'Point');
  let html = '';
  if (l.error) {
    html += `<p class="note bad">${esc(t('No se pudo abrir esta capa: {error}', {error: l.error}))}</p>
      <p class="muted text-sm">${esc(t('Quítela y vuelva a abrir el archivo con «Abrir archivo». Si el problema sigue, el archivo puede estar dañado.'))}</p>`;
  } else {
    html += `<table class="kv"><tr><th>${esc(t('Contenido'))}</th><td>${layerBadge(r)}${esc(layerSummary(l))}</td></tr>${
      r.kind === 'vector' && r.crs ? `<tr><th>${esc(t('Sistema de coordenadas del archivo'))}</th><td>${esc(crsName(r.crs))}<br><span class="muted text-sm">${esc(r.crs)}</span></td></tr>` : ''
    }</table>`;
  }
  // Lo que se puede hacer con la capa
  const acts = [];
  if (l.extent && !isEmpty(l.extent)) acts.push(`<button type="button" class="btn tonal" id="ldZoom">${icon('zoom')}${esc(t('Ver toda la capa'))}</button>`);
  if (r.kind === 'vector' && l.layer) {
    let follow = null;
    // Se sigue la línea (o el borde de área) más larga: el texto dice cuál de las dos es
    const lenOf = (f) => lengthLL(lineCoordsOf(f.getGeometry()) || []);
    const longest = lines.length ? lines.reduce((a, b) => (lenOf(b) > lenOf(a) ? b : a)) : null;
    const isArea = !!longest && /Polygon/.test(longest.getGeometry().getType());
    if (lines.length === 1) follow = isArea ? t('Recorrer el borde') : t('Seguir esta línea');
    else if (lines.length > 1) follow = isArea ? t('Recorrer el borde más largo') : t('Seguir la línea más larga');
    else if (pts.length > 1) follow = t('Recorrer los puntos');
    else if (pts.length === 1) follow = t('Navegar hasta el punto');
    const followIcon = lines.length || pts.length > 1 ? 'route' : 'flag';
    if (follow) acts.push(`<button type="button" class="btn" id="ldFollow">${icon(followIcon)}${esc(follow)}</button>`);
    acts.push(`<button type="button" class="btn" id="ldEdit">${icon('pencil')}${esc(t('Editar esta capa'))}</button>`);
  }
  if (acts.length) html += `<div class="row-actions col">${acts.join('')}</div>`;
  if (lines.length > 1) html += `<p class="muted text-sm">${esc(t('Para seguir otra línea, tóquela en el mapa.'))}</p>`;
  // Aspecto
  html += `<div class="section-title">${esc(t('Aspecto'))}</div>`;
  html += `<label class="field"><span>${esc(t('Nombre'))}</span><input id="ldName" type="text" maxlength="80" autocomplete="off" value="${esc(r.name)}"></label>`;
  const transp = Math.round((1 - (r.opacity ?? 1)) * 100);
  html += `<label class="field"><span>${esc(t('Transparencia'))} <b id="ldOpV">${esc(pct(transp))}</b></span><input type="range" id="ldOp" min="0" max="100" step="5" value="${transp}"><small>${esc(t('Deslice hacia la derecha para ver lo que hay debajo de esta capa.'))}</small></label>`;
  if (r.kind === 'vector') {
    html += `<div class="field"><span>${esc(t('Color'))}</span><div class="swatches" role="group" aria-label="${esc(t('Color'))}">${PALETTE.map((c) => {
      const on = c === r.color;
      return `<button type="button" class="sw ${on ? 'on' : ''}" data-c="${c}" style="background:${c};color:${inkOn(c)};display:grid;place-items:center" aria-pressed="${on}" aria-label="${esc(SWATCH_NAMES[c] ? t(SWATCH_NAMES[c]) : c)}">${on ? icon('check') : ''}</button>`; // i18n-dynamic
    }).join('')}</div></div>`;
  }
  if (r.kind === 'raster' && l.info && l.info.bands === 1) {
    const cur = rampCode(r.ramp) || defaultRamp(l.info);
    html += `<label class="field"><span>${esc(t('Colores de la imagen'))}</span><select id="ldRamp">${RAMP_NAMES.map(([k, n]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(t(n))}</option>`).join('')}</select></label>`; // i18n-dynamic
  }
  // Orden en el mapa (aquí y no en la lista: botones grandes, sin tocar la flecha equivocada)
  if (layers.length > 1 && i >= 0) {
    html += `<div class="section-title">${esc(t('Orden en el mapa'))}</div>
      <p class="muted text-sm" style="margin:0">${esc(t('Posición {k} de {n}. La capa de arriba se dibuja encima de las demás.', {k: fmtNum(i + 1), n: fmtNum(layers.length)}))}</p>
      <div class="row-actions"><button type="button" class="btn" id="ldUp" ${i > 0 ? '' : 'disabled'}>${icon('up')}${esc(t('Subir'))}</button><button type="button" class="btn" id="ldDown" ${i < layers.length - 1 ? '' : 'disabled'}>${icon('down')}${esc(t('Bajar'))}</button></div>`;
  }
  // Sistema de coordenadas de la imagen
  if (r.kind === 'raster') {
    html += `<div class="section-title">${esc(t('Sistema de coordenadas'))}</div>
      <p style="margin:4px 0">${esc(r.crs ? crsName(r.crs) : t('Sin definir'))} <span class="muted text-sm">${esc(r.crs || '')}</span></p>
      <div class="row-actions"><button type="button" class="btn" id="ldCrs">${icon('globe')}${esc(t('Cambiar el sistema de coordenadas'))}</button></div>
      <p class="muted text-sm">${esc(t('Cámbielo solo si la imagen aparece corrida de su lugar.'))}</p>`;
  }
  if (l.info) {
    const all = describeRaster(l.info);
    const kv = (list) => `<table class="kv">${list.map((x) => `<tr><th>${esc(x[0])}</th><td>${esc(x[1])}</td></tr>`).join('')}</table>`;
    const tech = all.filter((x) => x.tech);
    html += `<details ${DETAILS}><summary ${SUMMARY}>${esc(t('Detalles de la imagen'))}</summary>${kv(all.filter((x) => !x.tech))}${
      tech.length ? `<div class="section-title">${esc(t('Detalles técnicos'))}</div>${kv(tech)}` : ''
    }</details>`;
  }
  html += `<div class="row-actions"><button type="button" class="btn danger block" id="ldDel">${icon('trash')}${esc(t('Quitar capa'))}</button></div>`;
  const body = openSheet(r.name, html, {onBack: () => layersSheet()});
  $('#ldName').onchange = (e) => {
    const v = e.target.value.trim();
    if (!v) {
      e.target.value = r.name;
      return toast(t('Escriba un nombre para la capa.'));
    }
    r.name = v;
    delete r.nameKey; // nombre propio: ya no se traduce solo
    persist();
    const h = $('#sheetTitle');
    if (h) h.textContent = v;
  };
  $('#ldOp').oninput = (e) => {
    const v = Number(e.target.value);
    r.opacity = 1 - v / 100;
    $('#ldOpV').textContent = pct(v);
    l.layer && l.layer.setOpacity(r.opacity);
  };
  $('#ldOp').onchange = () => persist();
  body.querySelectorAll('[data-c]').forEach((b) => (b.onclick = async () => {
    r.color = b.dataset.c;
    const {vectorStyle} = await import('./layers.js');
    l.layer.setStyle(vectorStyle(r.color, true, !r.noFill));
    persist();
    layerDetail(l);
  }));
  if ($('#ldRamp')) $('#ldRamp').onchange = (e) => { r.ramp = e.target.value; rebuild(l); };
  if ($('#ldCrs')) $('#ldCrs').onclick = async () => {
    const c = await askCrsFor(r.name, {reason: t('Elija otro sistema solo si la imagen aparece corrida de su lugar o si el archivo no indica el suyo.'), current: r.crs});
    if (c && c !== r.crs) {
      r.crs = c;
      r.crsOverride = true;
      rebuild(l, {zoom: true});
    }
  };
  if ($('#ldZoom')) $('#ldZoom').onclick = () => zoomToLayer(l);
  if ($('#ldFollow')) $('#ldFollow').onclick = () => navigateLayer(l);
  if ($('#ldEdit')) $('#ldEdit').onclick = () => {
    closeSheet();
    editor.start(l);
  };
  const move = (d) => {
    const k = layers.indexOf(l);
    const j = k + d;
    if (k < 0 || j < 0 || j >= layers.length) return;
    [layers[j], layers[k]] = [layers[k], layers[j]];
    restack();
    persist();
    layerDetail(l);
  };
  if ($('#ldUp')) $('#ldUp').onclick = () => move(-1);
  if ($('#ldDown')) $('#ldDown').onclick = () => move(1);
  $('#ldDel').onclick = () => confirmRemoveLayer(l);
}

/** Quitar una capa: dice qué se pierde y, si se editó en la app, ofrece exportarla antes. */
async function confirmRemoveLayer(l) {
  const r = l.rec;
  const notes = [];
  if (r.editable) notes.push(t('Esta capa se creó o se cambió en la app. Si no la exportó, sus cambios se perderán.'));
  else if (BUNDLED_ORTHOS.some((o) => o.key === r.bundled)) notes.push(t('Puede volver a agregarla en Ajustes → Práctica y datos de ejemplo.'));
  else if (r.demo) notes.push(t('Puede volver a cargar los datos de ejemplo en Ajustes.'));
  if (r.file && HAS_NATIVE && !r.url) notes.push(t('Se borra la copia guardada en la app. El archivo original de su teléfono no se toca.'));
  const buttons = [{label: t('Cancelar'), value: null}];
  if (r.editable && l.layer) buttons.push({label: t('Exportar primero'), value: 'export', icon: 'download'});
  buttons.push({label: t('Quitar'), value: 'remove', danger: true});
  const v = await dialog(t('¿Quitar «{name}»?', {name: r.name}), notes.map((x) => `<p>${esc(x)}</p>`).join(''), buttons);
  if (v === 'export') return exportLayerGeoJSON(l);
  if (v !== 'remove') return;
  removeEntry(l);
  if (r.file && HAS_NATIVE && !layers.some((x) => x.rec.file === r.file)) call('deleteFile', r.file);
  if (r.replaced && HAS_NATIVE && !layers.some((x) => x.rec.file === r.replaced)) call('deleteFile', r.replaced);
  layersSheet();
  toast(t('Capa quitada: {name}', {name: r.name}));
}

/** Copia de una capa en GeoJSON (WGS 84), para guardarla antes de quitarla. */
function exportLayerGeoJSON(l) {
  const text = new GeoJSON().writeFeatures(l.layer.getSource().getFeatures(), {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857', decimals: 9});
  saveText(`${safeFileName(l.rec.name, 'layer')}.geojson`, 'application/geo+json', text);
}

async function rebuild(l, {zoom = false} = {}) {
  const i = layers.indexOf(l);
  const blob = blobs.get(l.rec.id); // modo web: el archivo vive solo en memoria
  removeEntry(l);
  if (blob) blobs.set(l.rec.id, blob);
  const e = await addRecord(l.rec, {zoom});
  if (e && i >= 0) {
    layers.splice(layers.indexOf(e), 1);
    layers.splice(i, 0, e);
    restack();
    persist();
  }
  closeSheet();
}

// --- navegación desde una capa o un elemento
function lineCoordsOf(geom) {
  const type = geom.getType();
  if (type === 'LineString') return geom.getCoordinates().map(toLL);
  if (type === 'MultiLineString') return geom.getCoordinates().flat().map(toLL);
  if (type === 'Polygon') return geom.getCoordinates()[0].map(toLL);
  if (type === 'MultiPolygon') return geom.getCoordinates()[0][0].map(toLL);
  return null;
}

function pointsOfLayer(l) {
  const feats = l.layer.getSource().getFeatures().filter((f) => f.getGeometry() && f.getGeometry().getType() === 'Point');
  const allNumericId = feats.every((f) => f.get('id') !== undefined && isFinite(Number(f.get('id'))));
  // Orden natural en el idioma de la app (P2 antes que P10)
  const byName = (a, b) => String(a.get('name') ?? a.get('nombre') ?? '').localeCompare(String(b.get('name') ?? b.get('nombre') ?? ''), locale(), {numeric: true});
  const sorted = allNumericId
    ? [...feats].sort((a, b) => Number(a.get('id')) - Number(b.get('id')))
    : feats.some((f) => f.get('name') || f.get('nombre'))
      ? [...feats].sort(byName)
      : [...feats].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0)); // orden del archivo
  return sorted.map((f, i) => ({ll: toLL(f.getGeometry().getCoordinates()), name: String(f.get('nombre') ?? f.get('name') ?? f.get('id') ?? i + 1), line: f.get('linea') ?? f.get('line') ?? null, feature: f}));
}

function navigateLayer(l, startFeature) {
  const feats = l.layer.getSource().getFeatures();
  const lines = feats.filter((f) => f.getGeometry() && /Line|Polygon/.test(f.getGeometry().getType()));
  const pts = feats.filter((f) => f.getGeometry() && f.getGeometry().getType() === 'Point');
  if (!lines.length && !pts.length) return toast(t('Esta capa no tiene puntos ni líneas para seguir.'));
  closeSheet();
  if (pts.length > 1 && (!lines.length || startFeature)) {
    const seq = pointsOfLayer(l);
    let start = 0;
    if (startFeature) start = Math.max(0, seq.findIndex((p) => p.feature === startFeature));
    nav.startPoints(seq.map(({ll, name, line}) => ({ll, name, line})), l.rec.name, {layerId: l.rec.id, startIndex: start});
  } else if (lines.length) {
    const f = lines.reduce((a, b) => (lengthLL(lineCoordsOf(b.getGeometry())) > lengthLL(lineCoordsOf(a.getGeometry())) ? b : a));
    nav.startLine(lineCoordsOf(f.getGeometry()), f.get('name') || f.get('nombre') || l.rec.name, {layerId: l.rec.id});
  } else if (pts.length === 1) {
    nav.startTarget(toLL(pts[0].getGeometry().getCoordinates()), pts[0].get('name') || pts[0].get('nombre') || l.rec.name);
  }
  if (followMode === 'off' && gps.fix) setFollow('follow');
}

/** «A 120 m de usted, hacia el NE (45°)», o '' sin posición GPS. */
function distanceFromMe(ll) {
  const f = gps.fix;
  if (!f) return '';
  const here = [f.lon, f.lat];
  const d = lengthLL([here, ll]);
  if (d < 1) return t('Está aquí mismo.');
  const deg = sphericalBearing(here, ll);
  return t('A {d} de usted, hacia el {dir} ({deg}°).', {d: fmtDist(d), dir: cardinal(deg), deg: fmtNum(Math.round(deg) % 360)});
}

function featureSheet(feature, entry) {
  const g = feature.getGeometry();
  const type = g.getType();
  const props = Object.entries(feature.getProperties()).filter(([k, v]) => k !== 'geometry' && v !== null && v !== undefined && typeof v !== 'object' && String(v) !== '');
  let geomRows = '';
  let actions = '';
  if (type === 'Point') {
    const ll = toLL(g.getCoordinates());
    const near = distanceFromMe(ll);
    geomRows = `${near ? `<p class="note info">${esc(near)}</p>` : ''}${allCoordsHtml(ll, feature.get('z'))}`;
    actions += `<button type="button" class="btn primary" data-a="goto">${icon('flag')}${esc(t('Navegar hasta aquí'))}</button>`;
    const nPts = entry && entry.layer ? entry.layer.getSource().getFeatures().filter((f) => f.getGeometry() && f.getGeometry().getType() === 'Point').length : 0;
    if (nPts > 1) actions += `<button type="button" class="btn" data-a="seq">${icon('route')}${esc(t('Recorrer los puntos desde aquí'))}</button>`;
    actions += `<button type="button" class="btn" data-a="copy">${esc(t('Copiar coordenadas'))}</button>`;
  } else if (/Line/.test(type)) {
    const ll = lineCoordsOf(g);
    geomRows = `<table class="kv"><tr><th>${esc(t('Largo'))}</th><td>${esc(fmtDist(lengthLL(ll)))}</td></tr></table>`;
    actions += `<button type="button" class="btn primary" data-a="follow">${icon('route')}${esc(t('Seguir esta línea'))}</button><button type="button" class="btn" data-a="followrev">${icon('swap')}${esc(t('Seguir en sentido contrario'))}</button>`;
  } else if (/Polygon/.test(type)) {
    const ring = lineCoordsOf(g);
    geomRows = `<table class="kv"><tr><th>${esc(t('Área'))}</th><td>${esc(fmtArea(areaLL(ring.slice(0, -1))))}</td></tr><tr><th>${esc(t('Perímetro'))}</th><td>${esc(fmtDist(lengthLL(ring)))}</td></tr></table>`;
    actions += `<button type="button" class="btn primary" data-a="plan">${icon('route')}${esc(t('Planificar líneas o cuadrícula aquí'))}</button>`;
    actions += `<button type="button" class="btn" data-a="follow">${icon('line')}${esc(t('Recorrer el borde'))}</button>`;
  }
  if (entry && entry.rec.kind === 'vector' && entry.layer && type !== 'GeometryCollection') actions += `<button type="button" class="btn" data-a="edit">${icon('pencil')}${esc(t('Editar este elemento'))}</button>`;
  // Atributos con nombres legibles (las claves conocidas se traducen; el valor guardado no cambia)
  const attrs = props.length
    ? `<h4>${esc(t('Atributos'))}</h4><table class="kv">${props.map(([k, v]) => {
      const label = attrLabel(k);
      return `<tr><th>${esc(label)}${label !== k ? `<br><span class="muted text-sm mono">${esc(k)}</span>` : ''}</th><td class="sel">${esc(attrText(k, v))}</td></tr>`;
    }).join('')}</table>`
    : '';
  const html = `${geomRows}<div class="row-actions col">${actions}</div>${attrs}${entry ? `<p class="muted text-sm">${esc(t('Capa: {name}', {name: entry.rec.name}))}</p>` : ''}`;
  const title = String(feature.get('name') ?? feature.get('nombre') ?? (entry ? entry.rec.name : t('Elemento')));
  const body = openSheet(title, html);
  body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'copy') return copyText(coordLines(toLL(g.getCoordinates())));
    closeSheet();
    if (a.dataset.a === 'plan') {
      // Todos los anillos del polígono: exterior y huecos. En un MultiPolygon se usa la parte más grande.
      const polys = type === 'MultiPolygon' ? g.getCoordinates() : [g.getCoordinates()];
      const outerArea = (poly) => areaLL(poly[0].map(toLL).slice(0, -1));
      const big = polys.reduce((p, q) => (outerArea(q) > outerArea(p) ? q : p));
      const rings = big.map((r) => r.map(toLL));
      planner.setArea(rings[0], title, rings.slice(1));
      planner.open();
      if (polys.length > 1) toast(tn(polys.length, 'Este elemento tiene {n} parte: se planifica en la más grande.', 'Este elemento tiene {n} partes: se planifica en la más grande.'), 5000);
      return;
    }
    if (a.dataset.a === 'edit') return editor.start(entry, {select: feature});
    if (a.dataset.a === 'goto') nav.startTarget(toLL(g.getCoordinates()), title);
    else if (a.dataset.a === 'seq') navigateLayer(entry, feature);
    else if (a.dataset.a === 'follow' || a.dataset.a === 'followrev') nav.startLine(lineCoordsOf(g), title, {reverse: a.dataset.a === 'followrev', layerId: entry && entry.rec.id});
    if (followMode === 'off' && gps.fix) setFollow('follow');
  });
}

/** Panel de un lugar cualquiera del mapa (al mantener el dedo sobre el mapa). */
function pointSheet(ll) {
  const near = distanceFromMe(ll);
  const body = openSheet(
    t('Punto en el mapa'),
    `${near ? `<p class="note info">${esc(near)}</p>` : ''}${allCoordsHtml(ll)}
    <div class="row-actions col"><button type="button" class="btn primary" data-a="goto">${icon('flag')}${esc(t('Navegar hasta aquí'))}</button><button type="button" class="btn" data-a="save">${icon('markPlus')}${esc(t('Guardar en Mis puntos'))}</button><button type="button" class="btn" data-a="copy">${esc(t('Copiar coordenadas'))}</button></div>`,
  );
  body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'goto') {
      closeSheet();
      nav.startTarget(ll, t('Punto en el mapa'));
      if (followMode === 'off' && gps.fix) setFollow('follow');
    } else if (a.dataset.a === 'copy') copyText(coordLines(ll));
    else if (a.dataset.a === 'save') {
      const name = await promptDialog(t('Guardar punto'), t('Nombre del punto'), waypoints.nextName());
      if (name === null) return;
      // Sin precisión (acc: null) = tocado en el mapa; la nota queda libre para el usuario
      const w = waypoints.add({name: name || undefined, lon: ll[0], lat: ll[1], acc: null, note: ''});
      closeSheet();
      toast(t('Guardado en Mis puntos: {name}', {name: w.name}));
    }
  });
}

// --- GPS
function gpsSheet() {
  const body = openSheet(t('Estado del GPS'), '<div id="gpsDetail"><div data-part="problem"></div><div data-part="live"></div><div data-part="actions"></div></div>');
  // Un solo manejador: las partes se redibujan con cada lectura, los botones se crean de nuevo
  body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]');
    if (!a || a.disabled) return;
    const act = a.dataset.a;
    if (act === 'perm' || act === 'start') {
      await ensureLocation();
      return renderGpsDetail();
    }
    if (act === 'appset') return call('openAppSettings');
    if (act === 'simstop') {
      gps.stopSimulation();
      toast(t('Simulación detenida'));
      return renderGpsDetail();
    }
    if (!gps.fix) return;
    if (act === 'mark') markHere();
    else if (act === 'copy') copyText(coordLines([gps.fix.lon, gps.fix.lat]));
    else if (act === 'avg') averageAndSave();
  });
  renderGpsDetail();
}

/** Cambia el contenido de un elemento solo si cambió (así no se pierde un toque a medio hacer). */
function setHtml(el, html) {
  if (el && el.__html !== html) {
    el.innerHTML = html;
    el.__html = html;
  }
}

const GNSS_NAMES = {G: 'GPS', R: 'GLONASS', E: 'Galileo', C: 'BeiDou', J: 'QZSS', S: 'SBAS', I: 'NavIC'};

function renderGpsDetail() {
  const el = $('#gpsDetail');
  if (!el) return;
  const f = gps.fix, g = gps.gnss, h = gps.heading;
  const part = (k) => el.querySelector(`[data-part="${k}"]`);
  const btn = (a, label, ic = '', cls = '') => `<button type="button" class="btn ${cls}" data-a="${a}">${ic ? icon(ic) : ''}${esc(label)}</button>`;

  // 1. Lo que impide usar el GPS, con el botón que lo arregla
  let problem = '';
  if (gps.sim) {
    problem = `<p class="note warn">${esc(t('Modo práctica: la posición es simulada, no es la suya.'))}</p><div class="row-actions">${btn('simstop', t('Detener la simulación'), 'stop')}</div>`;
  } else if (gps.permission === 'denied') {
    problem = `<p class="note bad">${esc(t('La app no tiene permiso para usar la ubicación. Sin él no puede mostrar dónde está, marcar puntos ni grabar recorridos.'))}</p><div class="row-actions col">${btn('perm', t('Permitir la ubicación'), 'locate', 'primary')}</div>`;
  } else if (gps.permission === 'approximate') {
    problem = `<p class="note warn">${esc(t('Android solo da a la app su ubicación aproximada (a unos 2 km). Para trabajar en el campo, active «Ubicación precisa» en los permisos de la app.'))}</p><div class="row-actions col">${btn('appset', t('Ajustes de la app'), 'gear', 'primary')}</div>`;
  } else if (gps.providerEnabled === false) {
    problem = `<p class="note bad">${esc(t('La ubicación del teléfono está apagada. Enciéndala en los ajustes rápidos (deslice desde arriba de la pantalla) y vuelva aquí.'))}</p>`;
  } else if (HAS_NATIVE && !gps.running) {
    problem = `<p class="note info">${esc(t('El GPS está apagado en la app.'))}</p><div class="row-actions col">${btn('start', t('Usar el GPS'), 'locate', 'primary')}</div>`;
  }
  setHtml(part('problem'), problem);

  // 2. Precisión explicada con palabras, datos de la lectura, satélites y brújula
  let live = '';
  if (f) {
    const age = (Date.now() - f.receivedAt) / 1000;
    const acc = fmtDist(f.acc);
    let cls, head, advice;
    if (age > 5) {
      cls = 'warn';
      head = age < 120 ? t('Sin lecturas nuevas desde hace {s} s', {s: fmtNum(age, 0)}) : t('Sin lecturas nuevas desde hace {m} min', {m: fmtNum(age / 60, 0)});
      advice = t('Salga a cielo abierto y espere. Los datos de abajo son de la última lectura.');
    } else if (f.acc <= 5) {
      cls = 'ok';
      head = t('Precisión buena: ±{acc}', {acc});
      advice = t('Sirve para ubicarse, marcar puntos y seguir líneas.');
    } else if (f.acc <= 15) {
      cls = 'warn';
      head = t('Precisión regular: ±{acc}', {acc});
      advice = t('Sirve para ubicarse. Para marcar puntos, espere un poco o promedie la posición.');
    } else {
      cls = 'bad';
      head = t('Precisión baja: ±{acc}', {acc});
      advice = t('Aléjese de árboles, edificios y techos, y espere a que mejore.');
    }
    live += `<p class="note ${cls}"><b>${esc(head)}</b><br>${esc(advice)}</p>
      <p class="muted text-sm">${esc(t('«±{acc}» quiere decir que, en 2 de cada 3 lecturas, su posición real está dentro del círculo azul que rodea su punto en el mapa.', {acc}))}</p>`;
    const speedUnit = settings.units === 'imperial' ? 'mph' : 'km/h';
    const speed = settings.units === 'imperial' ? f.speed * 2.236936 : f.speed * 3.6;
    const ageTxt = age < 1.5 ? t('Ahora') : age < 120 ? t('Hace {s} s', {s: fmtNum(age, 0)}) : t('Hace {m} min', {m: fmtNum(age / 60, 0)});
    const source = providerLabel(f.provider);
    const sourceTxt = f.mock ? t('{source} · simulada o de un receptor externo', {source}) : source;
    live += `<table class="kv">
      <tr><th>${esc(t('Precisión horizontal'))}</th><td><b>±${esc(acc)}</b></td></tr>
      ${isFinite(f.altAcc) && f.altAcc ? `<tr><th>${esc(t('Precisión vertical'))}</th><td>±${esc(fmtDist(f.altAcc))}</td></tr>` : ''}
      ${isFinite(f.msl) && f.msl !== null ? `<tr><th>${esc(t('Altitud sobre el nivel del mar'))}</th><td>${esc(fmtDist(f.msl))}</td></tr>` : ''}
      <tr><th>${esc(t('Fuente'))}</th><td>${esc(sourceTxt)}</td></tr>
      <tr><th>${esc(t('Última lectura'))}</th><td>${esc(ageTxt)}</td></tr>
      ${isFinite(f.speed) && f.speed !== null ? `<tr><th>${esc(t('Velocidad'))}</th><td>${esc(fmtNum(speed, 1))} ${speedUnit}</td></tr>` : ''}
      ${isFinite(f.course) && f.course !== null && f.speed > 0.5 ? `<tr><th>${esc(t('Dirección de marcha'))}</th><td>${esc(fmtNum(Math.round(f.course) % 360))}° ${esc(cardinal(f.course))}</td></tr>` : ''}
    </table>`;
    live += allCoordsHtml([f.lon, f.lat], f.alt);
  } else if (!gps.sim && gps.running) {
    live += `<p class="note info"><b>${esc(t('Buscando la señal GPS…'))}</b><br>${esc(t('Salga a cielo abierto. La primera posición puede tardar desde 30 segundos hasta unos minutos.'))}</p>`;
  }
  if (g) {
    const sys = Object.entries(g.byConst || {}).map(([k, v]) => `${GNSS_NAMES[k] || k} ${v.used}/${v.inView}`).join(' · ');
    live += `<h4>${esc(t('Satélites'))}</h4><table class="kv">
      <tr><th>${esc(t('En uso'))}</th><td>${esc(t('{used} de {seen} a la vista', {used: fmtNum(g.used), seen: fmtNum(g.inView)}))}</td></tr>
      <tr><th>${esc(t('Sistemas de satélites'))}</th><td>${esc(sys || '—')}</td></tr>
      <tr><th>${esc(t('Doble frecuencia (L5/E5a)'))}</th><td>${esc(g.dualFreq ? t('Sí: suele dar mejor precisión') : t('No detectada'))}</td></tr></table>
      <p class="muted text-sm">${esc(t('Con más satélites en uso, la posición suele ser mejor. Los edificios, los árboles y su propio cuerpo tapan la señal.'))}</p>`;
  }
  if (h) {
    const calib = [t('No fiable'), t('Poco fiable'), t('Buena'), t('Muy buena')][h.acc]; // estado del sensor de Android, de 0 a 3
    live += `<h4>${esc(t('Brújula'))}</h4><table class="kv">
      <tr><th>${esc(t('Rumbo (norte verdadero)'))}</th><td>${esc(fmtNum(Math.round(h.deg) % 360))}° ${esc(cardinal(h.deg))}</td></tr>
      <tr><th>${esc(t('Declinación magnética'))}</th><td>${isFinite(h.decl) ? `${esc(fmtNum(h.decl, 1))}°` : '—'}</td></tr>
      ${calib ? `<tr><th>${esc(t('Calibración'))}</th><td>${esc(calib)}</td></tr>` : ''}</table>
      ${h.acc !== undefined && h.acc <= 1 ? `<p class="note warn">${esc(t('Para calibrar la brújula, mueva el teléfono dibujando un 8 en el aire varias veces, lejos de metales y vehículos.'))}</p>` : ''}`;
  }
  setHtml(part('live'), live);

  // 3. Acciones (cambian poco: no se redibujan con cada lectura)
  const off = f ? '' : 'disabled';
  setHtml(part('actions'), `<div class="row-actions col">
    <button type="button" class="btn primary" data-a="mark" ${off}>${icon('markPlus')}${esc(t('Marcar un punto aquí'))}</button>
    <button type="button" class="btn" data-a="avg" ${off}>${icon('avg')}${esc(t('Promediar 60 s y guardar'))}</button>
    <button type="button" class="btn" data-a="copy" ${off}>${esc(t('Copiar coordenadas'))}</button></div>
    <p class="muted text-sm">${esc(t('Un teléfono suele dar ±3 a 5 m a cielo abierto. Para precisión de centímetros hace falta un receptor RTK externo (vea Ayuda).'))}</p>`);
}

// Marcar un punto en la posición GPS. Antes de guardar comprueba que la posición sea reciente y
// suficientemente precisa: un punto con una posición vieja o de ±40 m arruina el dato sin avisar.
const MARK_MAX_AGE_S = 10;
const MARK_WARN_ACC = 15;
async function markHere() {
  if (!(await ensureLocation())) return;
  const f = gps.fix;
  if (!f) return toast(t('Todavía no hay posición GPS. Salga a cielo abierto y espere unos segundos.'), 5000);
  const age = (Date.now() - (f.receivedAt || Date.now())) / 1000;
  if (age > MARK_MAX_AGE_S) {
    const go = await dialog(
      t('Posición vieja'),
      `<p>${t('La última posición GPS tiene {s} s. Espere a que vuelva la señal para marcar donde está ahora.', {s: Math.round(age)})}</p>`,
      [{label: t('Cancelar'), value: false}, {label: t('Marcar igual'), value: true}],
    );
    if (!go) return;
  } else if (f.acc > MARK_WARN_ACC) {
    const how = await dialog(
      t('Precisión baja'),
      `<p>${t('El GPS indica ±{acc} m. Puede marcar igual, o promediar la posición durante 60 s para mejorarla.', {acc: fmtNum(f.acc, 0)})}</p>`,
      [{label: t('Cancelar'), value: null}, {label: t('Promediar'), value: 'avg'}, {label: t('Marcar igual'), value: 'mark', primary: true}],
    );
    if (!how) return;
    if (how === 'avg') return averageAndSave();
  }
  const name = await promptDialog(t('Guardar punto'), t('Precisión ±{acc} m. Nombre del punto:', {acc: fmtNum(f.acc, 1)}), waypoints.nextName());
  if (name === null) return;
  const w = waypoints.add({name: name || undefined, lon: f.lon, lat: f.lat, alt: f.alt, msl: f.msl, acc: f.acc, note: ''});
  toast(t('Guardado en Mis puntos: {name} · ±{acc}', {name: w.name, acc: fmtDist(f.acc)}));
}

/**
 * Pide la ubicación cuando hace falta (no al abrir la app) y explica antes para qué se usa.
 * Si Android ya no deja volver a preguntar, ofrece abrir los ajustes de la app.
 */
async function ensureLocation() {
  if (gps.sim) return true;
  if (!HAS_NATIVE) {
    if (!gps.running) gps.start();
    return true;
  }
  const st = call('getLocationPermission');
  if (st === 'granted' || st === 'approximate') {
    if (!gps.running) gps.start();
    return true;
  }
  if (st === 'blocked') {
    const go = await dialog(
      t('Ubicación desactivada para la app'),
      `<p>${t('Para ver su posición, marcar puntos y grabar recorridos, permita la ubicación en los ajustes de Android: Permisos → Ubicación → «Permitir solo mientras se usa la app».')}</p>`,
      [{label: t('Ahora no'), value: false}, {label: t('Abrir ajustes'), value: true, primary: true}],
    );
    if (go) call('openAppSettings');
    return false;
  }
  const ok = await dialog(
    t('Usar su ubicación'),
    `<p>${t('Mapa de Campo usa el GPS del teléfono para mostrar dónde está, marcar puntos, medir y guiarle por líneas y puntos.')}</p>
     <p class="muted">${t('Su posición no sale del teléfono: la app no tiene servidores ni envía sus datos.')}</p>`,
    [{label: t('Ahora no'), value: false}, {label: t('Continuar'), value: true, primary: true}],
  );
  if (!ok) return false;
  gps.start(); // Android muestra su propia pregunta; la respuesta llega después
  return false; // quien llamó vuelve a intentarlo cuando el permiso ya esté dado
}

// Promediar la posición: junta lecturas durante unos segundos para un punto más estable. Se ve el
// avance en un diálogo con «Cancelar» (también lo cancela el botón Atrás).
const AVG_SECONDS = 60;
let averaging = null; // AbortController mientras se promedia

async function averageAndSave(secs = AVG_SECONDS) {
  if (averaging) return toast(t('Ya se está promediando una posición.'));
  if (!(await ensureLocation())) return;
  // Sin permiso, con la ubicación apagada o solo aproximada, promediar no sirve: se dice qué hacer
  const u = gps.usability({maxAge: Infinity, maxAcc: Infinity});
  if (['denied', 'off', 'approximate'].includes(u.code)) return toast(gps.problem({maxAge: Infinity, maxAcc: Infinity}).text, 7000);
  closeSheet();
  const ctl = new AbortController();
  averaging = ctl;
  let finished = false;
  const progress = (s, n) => tn(n, 'Promediando: {s} de {total} s · {n} lectura', 'Promediando: {s} de {total} s · {n} lecturas', {s: fmtNum(Math.min(s, secs), 0), total: fmtNum(secs, 0)});
  dialog(
    t('Promediar la posición'),
    `<p>${esc(t('Deje el teléfono quieto, a cielo abierto, hasta que termine. Varias lecturas juntas dan un punto más estable.'))}</p>
     <p id="avgTxt" role="status" aria-live="polite" style="font-weight:700;margin:8px 0">${esc(progress(0, 0))}</p>
     <p id="avgSpread" class="muted text-sm" style="margin:0 0 8px"></p>
     <div style="height:10px;border-radius:5px;background:var(--surface-3);overflow:hidden"><i id="avgBar" style="display:block;height:100%;width:0;background:var(--primary)"></i></div>`,
    [{label: t('Cancelar'), value: 'cancel'}],
  ).then(() => {
    if (!finished) ctl.abort(); // «Cancelar», Atrás o un toque fuera del diálogo
  });
  const r = await averagePosition(gps, secs, (s, n, spread) => {
    const txt = $('#avgTxt'), sp = $('#avgSpread'), bar = $('#avgBar');
    if (txt) txt.textContent = progress(s, n);
    if (sp) sp.textContent = n > 1 ? t('Las lecturas varían ±{d} entre sí.', {d: fmtDist(spread)}) : '';
    if (bar) bar.style.width = `${Math.min(100, (s / secs) * 100)}%`;
  }, ctl.signal);
  finished = true;
  averaging = null;
  if (!ctl.signal.aborted) closeModal();
  if (!r) {
    return toast(ctl.signal.aborted ? t('Promedio cancelado: no se guardó ningún punto.') : t('No llegaron lecturas GPS durante el promedio. Pruebe al aire libre, lejos de techos y árboles.'), 6000);
  }
  const name = await promptDialog(
    t('Guardar punto promediado'),
    tn(r.n, 'Promedio de {n} lectura · ±{acc}. Nombre del punto:', 'Promedio de {n} lecturas · ±{acc}. Nombre del punto:', {acc: fmtDist(r.acc)}),
    waypoints.nextName(),
  );
  if (name === null) return;
  // Datos numéricos, iguales en todos los idiomas; la nota queda libre para el usuario
  const w = waypoints.add({name: name || undefined, lon: r.lon, lat: r.lat, alt: r.alt, acc: r.acc, avgN: r.n, avgS: secs, spread: r.spread, note: ''});
  toast(t('Guardado en Mis puntos: {name} · ±{acc}', {name: w.name, acc: fmtDist(r.acc)}));
}

// --- Puntos
/** Fecha, precisión y origen de un punto, en una línea. */
function waypointInfo(w) {
  const date = fmtDateTime(w.time);
  if (w.acc === null || w.acc === undefined) return t('{date} · tocado en el mapa', {date});
  if (w.avgN > 1) return tn(w.avgN, '{date} · ±{acc} · promedio de {n} lectura', '{date} · ±{acc} · promedio de {n} lecturas', {date, acc: fmtDist(w.acc)});
  return `${date} · ±${fmtDist(w.acc)}`;
}

/** Nota escrita por el usuario. Las notas automáticas (en español) de versiones anteriores no se muestran. */
function waypointNote(w) {
  const n = String(w.note || '').trim();
  return /^(marcado en el mapa|promedio \d+ s\b)/i.test(n) ? '' : n;
}

function waypointsSheet() {
  const n = waypoints.list.length;
  // El más reciente arriba: es el que se busca en el campo
  const rows = [...waypoints.list].reverse().map((w) => `<div class="layer-row" data-id="${esc(w.id)}">
      <button type="button" class="layer-main" data-a="go" ${ROW_BTN}><span class="layer-name">${esc(w.name)}</span><span class="layer-sub" style="display:block;white-space:normal">${esc(waypointInfo(w))}</span></button>
      <button type="button" class="icon-btn" data-a="nav" aria-label="${esc(t('Navegar hasta «{name}»', {name: w.name}))}">${icon('flag')}</button>
      <button type="button" class="icon-btn" data-a="ren" aria-label="${esc(t('Renombrar «{name}»', {name: w.name}))}">${icon('pencil')}</button>
      <button type="button" class="icon-btn" data-a="del" aria-label="${esc(t('Borrar «{name}»', {name: w.name}))}">${icon('trash')}</button></div>`).join('');
  const off = n ? '' : 'disabled';
  const exp = (fmt, title, sub) => `<button type="button" class="list-row" data-x="${fmt}" ${off}>${icon('download')}<span><b>${esc(title)}</b><small>${esc(sub)}</small></span></button>`;
  const inCR = waypoints.list.some((w) => inCostaRica(w.lon, w.lat));
  const body = openSheet(
    t('Mis puntos'),
    `${n
    ? `<p class="muted text-sm" style="margin:0 0 4px">${esc(tn(n, '{n} punto guardado. Toque uno para verlo en el mapa.', '{n} puntos guardados. Toque uno para verlo en el mapa.'))}</p>${rows}`
    : `<p class="note info">${esc(t('Todavía no hay puntos. Toque «Marcar» para guardar donde está, o mantenga el dedo sobre el mapa para guardar otro lugar.'))}</p>`}
    <div class="row-actions col"><button type="button" class="btn primary" data-x="mark">${icon('markPlus')}${esc(t('Marcar un punto aquí'))}</button>
      <button type="button" class="btn" data-x="plan" ${n >= 3 ? '' : 'disabled'}>${icon('route')}${esc(t('Planificar con estos puntos como esquinas'))}</button></div>
    ${n < 3 ? `<p class="muted text-sm">${esc(t('Para planificar hacen falta al menos 3 puntos.'))}</p>` : ''}
    <div class="section-title">${esc(t('Exportar'))}</div>
    <div class="list">
      ${exp('gpx', 'GPX', t('Para Google Earth, Garmin y otras apps de GPS.'))}
      ${exp('csv', 'CSV', inCR ? t('Para Excel u hojas de cálculo: latitud y longitud, UTM y CRTM05.') : t('Para Excel u hojas de cálculo: latitud y longitud, y UTM.'))}
      ${exp('geojson', 'GeoJSON', t('Para QGIS, ArcGIS y otros programas SIG.'))}
    </div>
    <p class="muted text-sm">${esc(t('Después elija dónde guardar el archivo.'))}</p>`,
  );
  body.addEventListener('click', async (e) => {
    const x = e.target.closest('[data-x]');
    if (x && x.disabled) return;
    if (x && x.dataset.x === 'mark') {
      closeSheet();
      return markHere();
    }
    if (x && x.dataset.x === 'plan') {
      planner.setAreaFromPoints(waypoints.list.map((w) => [w.lon, w.lat]), tn(n, 'Desde {n} punto marcado', 'Desde {n} puntos marcados'));
      planner.open();
      return;
    }
    if (x) {
      // Nombre de archivo en el idioma de la app; el contenido es el mismo en todos los idiomas
      const base = `${safeFileName(t('Mis puntos'), 'points')}_${fileStamp()}`;
      if (x.dataset.x === 'gpx') saveText(`${base}.gpx`, 'application/gpx+xml', toGPX({waypoints: waypoints.list, name: t('Mis puntos')}));
      if (x.dataset.x === 'geojson') saveText(`${base}.geojson`, 'application/geo+json', toGeoJSON({waypoints: waypoints.list}));
      if (x.dataset.x === 'csv') saveText(`${base}.csv`, 'text/csv', toCSV(waypoints.list, projFns));
      return;
    }
    const a = e.target.closest('[data-a]');
    const row = e.target.closest('[data-id]');
    if (!a || !row) return;
    const w = waypoints.list.find((q) => String(q.id) === row.dataset.id);
    if (!w) return;
    if (a.dataset.a === 'go') {
      closeSheet();
      view.animate({center: fromLL([w.lon, w.lat]), zoom: Math.max(view.getZoom(), 19), duration: 400});
    } else if (a.dataset.a === 'nav') {
      closeSheet();
      nav.startTarget([w.lon, w.lat], w.name);
      if (followMode === 'off' && gps.fix) setFollow('follow');
    } else if (a.dataset.a === 'ren') {
      const name = await promptDialog(t('Renombrar punto'), t('Nombre del punto'), w.name);
      if (name) {
        waypoints.rename(w.id, name);
        waypointsSheet();
      }
    } else if (a.dataset.a === 'del') {
      if (await confirmDialog(t('Borrar punto'), t('¿Borrar «{name}»? No se puede deshacer.', {name: w.name}), t('Borrar'), true)) {
        waypoints.remove(w.id);
        waypointsSheet();
        toast(t('Punto borrado: {name}', {name: w.name}));
      }
    }
  });
}

// --- Grabar recorrido
function trackSheet() {
  const body = openSheet(t('Grabar recorrido'), '<div id="trackDetail"><div data-part="info"></div><div data-part="actions"></div></div>');
  body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]');
    if (!a || a.disabled) return;
    const act = a.dataset.a;
    if (act === 'start') {
      if (!(await ensureLocation())) return;
      track.start();
    } else if (act === 'stop') track.stop();
    else if (act === 'gpx') saveText(`${safeFileName(t('Recorrido'), 'track')}_${fileStamp()}.gpx`, 'application/gpx+xml', toGPX({track: track.data, name: track.data.name}));
    else if (act === 'layer') await trackToLayer();
    else if (act === 'clear') {
      const ok = await confirmDialog(t('Borrar el recorrido'), t('¿Borrar el recorrido grabado? No se puede deshacer. Si lo necesita, expórtelo o guárdelo como capa antes.'), t('Borrar'), true);
      if (!ok) return;
      track.clear();
      toast(t('Recorrido borrado.'));
    }
    renderTrackDetail();
  });
  renderTrackDetail();
}

function renderTrackDetail() {
  const el = $('#trackDetail');
  if (!el || !sheetIsOpen()) return;
  const s = track.stats();
  const rec = track.recording;
  const dot = `<span class="rec" style="display:inline-block;vertical-align:middle;margin-inline-end:4px">${icon('rec')}</span>`;
  let status;
  if (rec && s.noSignal) status = `<p class="note warn"><b>${esc(t('Grabando, pero sin señal GPS.'))}</b><br>${esc(t('Los puntos se guardan cuando vuelva la señal. Salga a cielo abierto.'))}</p>`;
  else if (rec && s.waitAcc !== null) {
    status = `<p class="note warn"><b>${esc(t('Grabando, pero el GPS está impreciso (±{acc}).', {acc: fmtDist(s.waitAcc)}))}</b><br>${esc(t('Solo se guardan las posiciones mejores que ±{max}. Espere a que mejore.', {max: fmtDist(settings.trackMaxAcc)}))}</p>`;
  } else if (rec) status = `<p class="note ok">${dot}<b>${esc(t('Grabando'))}</b><br>${esc(HAS_NATIVE ? t('Sigue grabando con la pantalla apagada.') : t('Mantenga esta página abierta mientras graba.'))}</p>`;
  else if (s.n) status = `<p class="note info">${esc(t('En pausa. «Continuar» sigue grabando el mismo recorrido. Para empezar otro, expórtelo o guárdelo como capa y luego bórrelo.'))}</p>`;
  else status = `<p>${esc(HAS_NATIVE ? t('Graba el camino que usted recorre con el GPS, también con la pantalla apagada.') : t('Graba el camino que usted recorre con el GPS.'))}</p>`;
  setHtml(el.querySelector('[data-part="info"]'), `${status}
    <table class="kv"><tr><th>${esc(t('Puntos'))}</th><td>${esc(fmtNum(s.n))}</td></tr><tr><th>${esc(t('Largo'))}</th><td>${esc(fmtDist(s.len))}</td></tr><tr><th>${esc(t('Duración'))}</th><td>${esc(fmtTime(s.dur))}</td></tr>${
      s.segments > 1 ? `<tr><th>${esc(t('Tramos'))}</th><td>${esc(fmtNum(s.segments))}</td></tr>` : ''
    }</table>`);
  const can = (ok) => (ok ? '' : 'disabled');
  setHtml(el.querySelector('[data-part="actions"]'), `<div class="row-actions col">${
    rec
      ? `<button type="button" class="btn danger big" data-a="stop">${icon('stop')}${esc(t('Detener'))}</button>`
      : `<button type="button" class="btn primary big" data-a="start">${icon('rec')}${esc(s.n ? t('Continuar') : t('Empezar a grabar'))}</button>`
  }</div>
    <div class="row-actions">
      <button type="button" class="btn" data-a="gpx" ${can(s.n > 1)}>${icon('download')}${esc(t('Exportar GPX'))}</button>
      <button type="button" class="btn" data-a="layer" ${can(s.n > 1)}>${icon('layers')}${esc(t('Guardar como capa'))}</button>
      <button type="button" class="btn danger" data-a="clear" ${can(s.n && !rec)}>${icon('trash')}${esc(t('Borrar'))}</button>
    </div>
    <p class="muted text-sm">${esc(t('Guarda un punto cada {d} como mínimo y descarta las posiciones con precisión peor que ±{acc}. Puede cambiarlo en Ajustes → Grabar recorrido.', {d: fmtDist(settings.trackMinDist), acc: fmtDist(settings.trackMaxAcc)}))}</p>`);
}

/** Copia del recorrido como capa de líneas (se ve en Capas, se puede editar y exportar). */
async function trackToLayer() {
  const name = track.data.name || t('Recorrido');
  try {
    const id = await addGeoJsonLayer(`recorrido_${fileStamp()}.geojson`, toGeoJSON({track: track.data}), {name});
    toast(id ? t('Recorrido guardado como capa: «{name}». Lo encuentra en Capas.', {name}) : t('El recorrido no se pudo guardar como capa. Pruebe otra vez.'), 5000);
  } catch (e) {
    toast(e.message, 6000);
  }
}

function updateTrackUi() {
  const b = $('#btnTrack');
  const rec = track.recording;
  b.classList.toggle('rec-on', rec);
  const st = track.stats();
  b.querySelector('.dock-lbl').textContent = rec ? (st.len > 0 ? fmtDist(st.len) : t('Grabando')) : t('Grabar');
  b.setAttribute('aria-label', rec ? t('Grabando recorrido: {d}', {d: fmtDist(st.len)}) : t('Grabar recorrido'));
  // Con la barra inferior oculta (navegar, editar, medir), el aviso queda arriba
  $('#recPill').hidden = !rec;
  $('#recPill').textContent = t('REC');
}
track.onChange(updateTrackUi);
track.onChange(() => renderTrackDetail()); // el panel abierto se actualiza mientras graba

// --- Ajustes
const THEMES = [['auto', N_('Automático')], ['light', N_('Claro')], ['dark', N_('Oscuro')], ['sun', N_('Sol')]];
const TEXT_SIZES = [['auto', N_('Auto')], ['0.9', 'A−'], ['1', 'A'], ['1.15', 'A+'], ['1.3', 'A++'], ['1.5', 'A+++']];
const UNITS = [['metric', N_('Métricas (m, km, ha)')], ['imperial', N_('Imperiales (ft, mi, ac)')]];
// Campos numéricos de Ajustes: [clave, mínimo, máximo]
const NUM_SETTINGS = {arrivalRadius: [0.5, 50], offRouteAlert: [0.5, 50], trackMinDist: [0.5, 100], trackMaxAcc: [2, 200]};

function settingsSheet() {
  const seg = (k, opts) => `<div class="seg" role="group" data-seg="${k}">${opts.map(([v, n]) => `<button type="button" data-v="${v}" class="${String(settings[k]) === v ? 'on' : ''}" aria-pressed="${String(settings[k]) === v}">${esc(t(n))}</button>`).join('')}</div>`; // i18n-dynamic
  const num = (k, label, hint) => `<label class="field"><span>${label}</span><input type="text" inputmode="decimal" data-num="${k}" value="${esc(fmtNum(settings[k], Number.isInteger(settings[k]) ? 0 : 1))}">${hint ? `<small>${hint}</small>` : ''}</label>`;
  const sw = (k, label, hint) => `<label class="switch"><input type="checkbox" data-k="${k}" ${settings[k] ? 'checked' : ''}><span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
  const langOpts = [['auto', t('Automático (idioma del teléfono)')], ...LANGS.map((l) => [l.code, l.name])];
  const fmtOpts = FORMATS.map(([k, n]) => `<option value="${k}" ${settings.coordFormat === k ? 'selected' : ''}>${esc(t(n))}</option>`).join(''); // i18n-dynamic
  const body = openSheet(
    t('Ajustes'),
    `<div class="section-title">${t('Pantalla')}</div>
     <label class="field"><span>${t('Idioma')}</span><select data-k="lang">${langOpts.map(([v, n]) => `<option value="${v}" ${settings.lang === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
     <div class="field"><span>${t('Tema')}</span>${seg('theme', THEMES)}<small>${t('«Sol» usa el máximo contraste para leer a pleno sol.')}</small></div>
     <div class="field"><span>${t('Tamaño del texto')}</span>${seg('textSize', TEXT_SIZES)}</div>
     ${sw('gloves', t('Botones grandes (para usar con guantes)'))}
     <div class="field"><span>${t('Unidades de las medidas')}</span>${seg('units', UNITS)}<small>${t('Las distancias que usted escribe en los campos siguen siendo en metros.')}</small></div>
     <label class="field"><span>${t('Formato de coordenadas')}</span><select data-k="coordFormat">${fmtOpts}</select><small>${t('También puede tocar la barra de coordenadas para cambiarlo.')}</small></label>
     ${sw('labels', t('Mostrar los nombres de los puntos al acercarse'))}
     ${sw('keepScreenOn', t('Mantener la pantalla encendida al navegar o grabar'), t('Con «Dibujar caminando» se mantiene siempre encendida.'))}
     <div class="section-title">${t('Navegación')}</div>
     ${num('arrivalRadius', t('Radio de llegada a un punto (m)'), t('A esta distancia el punto cuenta como alcanzado.'))}
     ${num('offRouteAlert', t('Aviso de desvío de la línea (m)'), t('Avisa si se aleja más que esto de la línea.'))}
     ${sw('autoAdvance', t('Pasar automáticamente al siguiente punto al llegar'))}
     ${sw('vibrate', t('Vibrar en los avisos'))}
     <div class="section-title">${t('Grabar recorrido')}</div>
     ${num('trackMinDist', t('Distancia mínima entre puntos (m)'))}
     ${num('trackMaxAcc', t('Descartar posiciones peores que (m)'), t('Evita saltos cuando la señal es mala.'))}
     <div class="section-title">${t('Práctica y datos de ejemplo')}</div>
     <div class="row-actions col">
       <button class="btn" id="simBtn">${gps.sim ? t('Detener la simulación') : t('Simular un recorrido por la línea activa')}</button>
       <button class="btn" id="demoBtn">${t('Cargar los datos de ejemplo (EARTH, Costa Rica)')}</button>
       ${missingBundled().length ? `<button class="btn" id="earthBtn">${icon('layers')} ${t('Agregar las ortofotos de EARTH (Costa Rica)')}</button>` : ''}
     </div>`,
  );
  body.addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    settings[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    saveSettings();
    if (k === 'lang') return reloadForLanguage();
    applySettings();
  });
  // Números: con coma o punto decimal; si no es válido, se avisa y se deja el valor anterior
  body.addEventListener('focusout', (e) => {
    const k = e.target.dataset.num;
    if (!k) return;
    const [min, max] = NUM_SETTINGS[k];
    const v = parseLocaleNumber(e.target.value);
    if (!Number.isFinite(v) || v < min || v > max) {
      toast(t('Escriba un número entre {min} y {max}.', {min: fmtNum(min, min % 1 ? 1 : 0), max: fmtNum(max, 0)}), 4000);
      e.target.value = fmtNum(settings[k], Number.isInteger(settings[k]) ? 0 : 1);
      return;
    }
    settings[k] = v;
    saveSettings();
    applySettings();
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] button');
    if (!b) return;
    const k = b.parentElement.dataset.seg;
    settings[k] = b.dataset.v;
    saveSettings();
    b.parentElement.querySelectorAll('button').forEach((x) => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    applySettings();
  });
  $('#simBtn').onclick = () => {
    if (gps.sim) { gps.stopSimulation(); toast(t('Simulación detenida')); }
    else {
      const path = nav.follower ? nav.follower.ll : nav.seq ? nav.seq.points.map((pt) => pt.ll) : null;
      if (!path) return toast(t('Primero toque una línea o un punto del mapa y elija «Seguir».'), 5000);
      gps.startSimulation(path);
      setFollow('follow');
      toast(t('Simulación: se recorre la línea a paso de caminata'));
    }
    closeSheet();
  };
  $('#demoBtn').onclick = async () => { closeSheet(); await loadDemo(true); };
  if ($('#earthBtn')) $('#earthBtn').onclick = () => { closeSheet(); installEarthPack({zoom: true}); };
}

/** El idioma se aplica recargando la página: así todo (también la parte nativa) cambia a la vez. */
function reloadForLanguage() {
  if (editor.active) editor.stop();
  persist();
  saveSettings();
  location.reload();
}

/** Pantalla encendida solo mientras se navega o se graba un track (ahorro de batería). */
let screenOn = null;
function applyScreen() {
  const want = (!!settings.keepScreenOn && (nav.isActive() || track.recording)) || !!(editor && editor.streaming); // sin pantalla, Android corta el GPS
  if (want !== screenOn) {
    screenOn = want;
    call('setKeepScreenOn', want);
  }
}
setInterval(applyScreen, 3000);

function applySettings() {
  applyLook();
  applyScreen();
  layers.forEach((l) => l.layer && l.layer.changed && l.layer.changed());
  updateGpsUi();
  updateTrackUi();
  call('setUiPrefs', getLang(), settings.units);
}

/** Tema, tamaño del texto y botones grandes. Se llama antes de crear el mapa (sin capas todavía). */
function applyLook() {
  const root = document.documentElement;
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = settings.theme === 'auto' ? (dark ? 'dark' : 'light') : settings.theme;
  root.dataset.theme = theme;
  root.dataset.dim = settings.theme === 'dark' ? '1' : '0'; // oscurece el mapa solo si se eligió «Oscuro»
  // Se llama antes de que se declaren las variables del módulo: el dato se guarda en la propia función
  if (!applyLook.info) applyLook.info = callJSON('getAppInfo') || {};
  const sys = Number(applyLook.info.fontScale) || 1;
  const scale = settings.textSize === 'auto' ? sys : Number(settings.textSize) || 1;
  root.style.setProperty('--text-scale', String(Math.min(2, Math.max(0.85, scale))));
  root.classList.toggle('gloves', !!settings.gloves);
  const bg = getComputedStyle(root).getPropertyValue('--map-bg').trim();
  if (/^#[0-9a-f]{6}$/i.test(bg) && bg !== applyLook.bg) {
    applyLook.bg = bg;
    call('setBackground', bg);
  }
}
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => settings.theme === 'auto' && applyLook();
  if (mq.addEventListener) mq.addEventListener('change', onScheme);
  else if (mq.addListener) mq.addListener(onScheme);
}

// --- Ayuda y Acerca de
function helpSheet() {
  const body = openSheet(t('Ayuda'), `<p class="muted">${t('Toque un tema para abrirlo.')}</p><div id="helpBody"></div>`, {wide: true});
  // Cada <h4> de la ayuda abre una sección plegable con lo que sigue hasta el próximo <h4>
  const src = document.createElement('div');
  src.innerHTML = HELP.help;
  const out = body.querySelector('#helpBody');
  let sec = null;
  for (const node of [...src.childNodes]) {
    if (node.nodeName === 'H4') {
      sec = document.createElement('details');
      sec.className = 'help-sec';
      if (node.id) sec.id = node.id;
      if (node.id === 'help-quick') sec.open = true;
      const sum = document.createElement('summary');
      sum.innerHTML = node.innerHTML;
      sec.appendChild(sum);
      out.appendChild(sec);
    } else if (sec) sec.appendChild(node);
    else out.appendChild(node);
  }
}

function aboutSheet() {
  const info = callJSON('getAppInfo') || {};
  const webview = info.webview || navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || '—';
  // Datos para soporte técnico, plegados: no hacen falta para usar la app
  const range = getRangeMode();
  const rangeTxt = !HAS_NATIVE ? '—' : range === 'bridge' ? t('Por el puente nativo (modo de respaldo)') : t('Por partes (normal)');
  openSheet(
    t('Acerca de'),
    `<p style="margin-top:0"><b>Mapa de Campo</b> · ${esc(t('Versión {v}', {v: info.versionName || APP_VERSION}))}</p>
    <p>${esc(t('Mapas de campo que funcionan sin internet: sus propias imágenes, puntos y recorridos, y guía con el GPS para seguir líneas y llegar a puntos.'))}</p>
    ${CREDIT_HTML}
    ${HELP.privacy}
    ${HELP.about}
    <div class="row-actions"><button type="button" class="btn" id="licBtn" aria-expanded="false">${icon('file')}${esc(t('Ver los textos de las licencias'))}</button></div>
    <pre id="licTxt" class="text-sm" hidden style="white-space:pre-wrap;max-height:50vh;overflow:auto"></pre>
    ${BIO_HTML}
    <details ${DETAILS}><summary ${SUMMARY}>${esc(t('Información técnica'))}</summary><table class="kv">
      <tr><th>Android</th><td>${esc(info.android || '—')}</td></tr>
      <tr><th>WebView</th><td>${esc(webview)}</td></tr>
      <tr><th>${esc(t('Lectura de imágenes grandes'))}</th><td>${esc(rangeTxt)}</td></tr>
      <tr><th>${esc(t('Dibujo de imágenes'))}</th><td>${esc(webglAvailable() ? 'WebGL' : t('Canvas 2D (modo compatible, más lento)'))}</td></tr>
    </table></details>`,
  );
  $('#licBtn').onclick = async () => {
    const pre = $('#licTxt');
    if (!pre.hidden) {
      pre.hidden = true;
      return $('#licBtn').setAttribute('aria-expanded', 'false');
    }
    try {
      const r = await fetch('licencias/LICENCIAS_TERCEROS.txt');
      if (!r.ok) throw new Error(String(r.status));
      pre.textContent = await r.text();
      pre.hidden = false;
      $('#licBtn').setAttribute('aria-expanded', 'true');
    } catch {
      toast(t('No se pudieron abrir los textos de las licencias. Vuelva a instalar la app si el problema sigue.'));
    }
  };
}

// ---------------------------------------------------------------------------
// Interacción con el mapa
let pressTimer = null, pressPixel = null;
map.getViewport().addEventListener('pointerdown', (e) => {
  if (measure.active || planner.drawing || editor.active) return;
  pressPixel = [e.clientX, e.clientY];
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    const px = map.getEventPixel(e);
    pointSheet(toLL(map.getCoordinateFromPixel(px)));
    pressPixel = null;
    if (call('vibrate', 30) === null && navigator.vibrate) navigator.vibrate(30);
  }, 650);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => map.getViewport().addEventListener(ev, () => clearTimeout(pressTimer)));
map.getViewport().addEventListener('pointermove', (e) => {
  if (pressPixel && Math.hypot(e.clientX - pressPixel[0], e.clientY - pressPixel[1]) > 8) clearTimeout(pressTimer);
});

map.on('singleclick', (e) => {
  if (measure.active || planner.drawing || editor.active || Date.now() - (planner.lastDrawEnd || 0) < 900) return;
  let hit = null;
  map.forEachFeatureAtPixel(
    e.pixel,
    (f, layer) => {
      if (!layer) return false;
      if (layer.get('system') && !layer.get('waypoints')) return false;
      hit = {f, layer};
      return true;
    },
    {hitTolerance: 12},
  );
  if (!hit) return;
  if (hit.layer.get('waypoints')) {
    const w = waypoints.list.find((q) => q.id === hit.f.get('waypoint'));
    if (w) {
      const note = waypointNote(w);
      const near = distanceFromMe([w.lon, w.lat]);
      const body = openSheet(
        w.name,
        `<p class="muted" style="margin-top:0">${esc(waypointInfo(w))}</p>${note ? `<p>${esc(note)}</p>` : ''}${near ? `<p class="note info">${esc(near)}</p>` : ''}
        ${allCoordsHtml([w.lon, w.lat], w.alt)}
        <div class="row-actions col"><button type="button" class="btn primary" data-a="nav">${icon('flag')}${esc(t('Navegar hasta aquí'))}</button><button type="button" class="btn" data-a="copy">${esc(t('Copiar coordenadas'))}</button><button type="button" class="btn text" data-a="list">${icon('pin')}${esc(t('Ver Mis puntos'))}</button></div>`,
      );
      body.addEventListener('click', (ev) => {
        const a = ev.target.closest('[data-a]');
        if (!a) return;
        if (a.dataset.a === 'copy') return copyText(coordLines([w.lon, w.lat]));
        if (a.dataset.a === 'list') return waypointsSheet();
        closeSheet();
        nav.startTarget([w.lon, w.lat], w.name);
        if (followMode === 'off' && gps.fix) setFollow('follow');
      });
    }
    return;
  }
  featureSheet(hit.f, layers.find((l) => l.layer === hit.layer));
});

// ---------------------------------------------------------------------------
// Botones
// Iconos de la barra inferior y de los controles del mapa
[['btnLayers', 'layers'], ['btnMark', 'markPlus'], ['btnTrack', 'recRing'], ['btnMeasure', 'ruler'], ['btnEdit', 'pencil']].forEach(([id, ic]) => ($(`#${id} .dock-ic`).innerHTML = icon(ic)));
$('#btnMenu').innerHTML = icon('menu');
$('#btnLocate').innerHTML = icon('locate');
$('#zoomIn').innerHTML = icon('plus');
$('#zoomOut').innerHTML = icon('minus');
$('#btnMenu').onclick = menuSheet;
$('#btnLayers').onclick = layersSheet;
$('#gpsChip').onclick = async () => {
  if (HAS_NATIVE && !gps.running && !gps.sim && !(await ensureLocation())) return;
  gpsSheet();
};
$('#btnMark').onclick = markHere;
$('#btnEdit').onclick = () => editor.chooser();
$('#btnTrack').onclick = trackSheet;
$('#btnMeasure').onclick = async () => {
  if (measure.active) return measure.stop();
  const kind = await dialog(t('Medir'), `<p>${t('¿Qué quiere medir? Toque el mapa en cada punto; las medidas son en metros reales sobre el terreno.')}</p>`, [
    {label: t('Cancelar'), value: null},
    {label: t('Área'), value: 'Polygon'},
    {label: t('Distancia'), value: 'LineString', primary: true},
  ]);
  if (kind) measure.start(kind);
};
// Barra de medir y de dibujar el área del plan: Deshacer · Cancelar · Listo
$('#mUndo').onclick = () => (planner.drawing ? planner.undoDraw() : measure.undo());
$('#mClose').onclick = () => {
  if (planner.drawing) {
    planner.stopDraw();
    planner.open();
  } else measure.stop();
};
$('#mDone').onclick = () => {
  if (planner.drawing) {
    if (typeof planner.finishDraw === 'function') planner.finishDraw();
  } else if (typeof measure.finish === 'function') measure.finish();
  else measure.stop();
};
$('#btnLocate').onclick = async () => {
  if (!(await ensureLocation())) return;
  if (!gps.fix) {
    toast(t('Buscando la señal GPS…'));
    setFollow('follow');
    return;
  }
  setFollow(followMode === 'off' ? 'follow' : followMode === 'follow' ? 'compass' : 'follow');
};
$('#north').onclick = () => {
  if (followMode === 'compass') setFollow('follow');
  view.animate({rotation: 0, duration: 300});
};
$('#coordBar').onclick = () => {
  if (!gps.fix) return void ensureLocation();
  // Los formatos de Costa Rica solo aparecen dentro del país
  const inCR = inCostaRica(gps.fix.lon, gps.fix.lat);
  const list = FORMATS.filter(([k]) => inCR || !k.startsWith('crtm05'));
  const i = list.findIndex((f) => f[0] === settings.coordFormat);
  settings.coordFormat = list[(i + 1) % list.length][0];
  saveSettings();
  updateGpsUi();
  toast(t(list.find((f) => f[0] === settings.coordFormat)[1]), 1800); // i18n-dynamic
};
$('#zoomIn').onclick = () => view.animate({zoom: view.getZoom() + 1, duration: 200});
$('#zoomOut').onclick = () => view.animate({zoom: view.getZoom() - 1, duration: 200});

// Botón "atrás" de Android
on('onBack', () => {
  if (closeModal()) return true;
  if (sheetBack()) return true; // detalle de una capa → vuelve a Capas
  if (closeSheet()) return true;
  if (planner.drawing) { planner.stopDraw(); planner.open(); return true; }
  if (editor.onBack()) return true;
  if (measure.active) { measure.stop(); return true; }
  return false;
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.MC.onBack();
});

// Enlaces externos (atribuciones): se abren en el navegador del sistema
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="http"]');
  if (a && HAS_NATIVE) {
    e.preventDefault();
    call('openUrl', a.href);
  }
});

// ---------------------------------------------------------------------------
// Ortofotos de EARTH incluidas en la app (IGN) y límite de la Universidad EARTH.
// Cada ortofoto se copia una sola vez del APK a la memoria de la app y queda como una capa
// GeoTIFF normal, sin conexión. Si el usuario quita una, no vuelve sola: Capas ofrece un
// botón para recuperarla. Orden en el mapa: la de 0,12 m (núcleo del campus) encima de la
// de 0,5 m (toda la universidad), ambas debajo de cualquier otro ráster.
const BUNDLED_ORTHOS = [
  {
    key: 'ortofoto_campus_1k',
    asset: 'bundled/ortofoto_campus_EARTH_IGN_012m.tif',
    file: '_incluida_ortofoto_campus_EARTH_IGN_012m.tif', // nombres que ninguna importación produce
    name: N_('Ortofoto campus EARTH · IGN 0,12 m'),
    attribution: 'Ortofoto 1:1000 2015-2018 © Registro Nacional – Instituto Geográfico Nacional (IGN), Costa Rica, vía SNIT', // i18n-ok (texto exigido por la licencia del IGN)
  },
  {
    key: 'ortofoto_EARTH_2015',
    asset: 'bundled/ortofoto_EARTH_IGN_2015_05m.tif',
    file: '_incluida_ortofoto_EARTH_IGN_2015_05m.tif',
    name: N_('Ortofoto EARTH 2015 · IGN 0,5 m'),
    attribution: 'Ortofoto 1:5000 2014-2017 © Registro Nacional – Instituto Geográfico Nacional (IGN), Costa Rica, vía SNIT', // i18n-ok (texto exigido por la licencia del IGN)
  },
];
const BOUNDARY = {url: 'demo/limite_Universidad_EARTH_OSM.geojson', name: N_('Límite de la Universidad EARTH (OpenStreetMap)'), color: '#ffeb3b', key: 'limite_EARTH'};
const orthoPending = new Map(); // key → {zoom, boundary}
let bundledReady = false; // hasta que init() termine de restaurar las capas guardadas

// Ajustes: qué ortofotos ya se instalaron solas y cuántos fallos seguidos lleva cada una
// (la versión 1.3 guardaba solo «orthoInstalled» para la de 0,5 m).
settings.bundledDone = settings.bundledDone || {};
settings.bundledFails = settings.bundledFails || {};
if (settings.orthoInstalled === 'ortofoto_EARTH_2015') settings.bundledDone.ortofoto_EARTH_2015 = true;

const bundledAvailable = (o) => HAS_NATIVE && call('hasAsset', o.asset) === true;
const bundledLoaded = (o) => layers.some((l) => l.rec.bundled === o.key);

/** Ortofotos incluidas que faltan en el mapa (para el botón de Capas). */
function missingBundled() {
  if (!bundledReady) return [];
  return BUNDLED_ORTHOS.filter((o) => !bundledLoaded(o) && !orthoPending.has(o.key) && bundledAvailable(o));
}

function installBundled(o, {zoom = false, boundary = false} = {}) {
  if (!bundledReady || !bundledAvailable(o) || orthoPending.has(o.key) || bundledLoaded(o)) return false;
  orthoPending.set(o.key, {zoom, boundary});
  call('installAsset', o.asset, o.file);
  return true;
}

/** Ortofotos incluidas al fondo del mapa, en el orden de BUNDLED_ORTHOS. */
function placeBundledRasters() {
  const mine = BUNDLED_ORTHOS.map((o) => layers.find((l) => l.rec.bundled === o.key)).filter(Boolean);
  for (const e of mine) layers.splice(layers.indexOf(e), 1);
  layers.push(...mine);
  restack();
}

/** Límite de EARTH: solo el borde (los toques dentro del campus pasan a las capas de abajo), justo encima de los rásteres. */
async function ensureBoundary() {
  if (layers.some((l) => l.rec.url === BOUNDARY.url)) return;
  const e = await addRecord({id: newId(), kind: 'vector', name: t(BOUNDARY.name), nameKey: BOUNDARY.name, url: BOUNDARY.url, color: BOUNDARY.color, visible: true, opacity: 1, bundled: BOUNDARY.key, noFill: true}, {}); // i18n-dynamic
  if (!e) return;
  layers.splice(layers.indexOf(e), 1);
  const r = layers.findIndex((l) => l.rec.kind === 'raster');
  layers.splice(r < 0 ? layers.length : r, 0, e);
  restack();
}

on('onAssetInstalled', async (json) => {
  const res = typeof json === 'string' ? JSON.parse(json) : json;
  const o = res && BUNDLED_ORTHOS.find((x) => x.asset === res.asset);
  if (!o) return;
  const opts = orthoPending.get(o.key) || {};
  const fail = () => {
    settings.bundledFails[o.key] = (settings.bundledFails[o.key] || 0) + 1;
    saveSettings();
  };
  try {
    if (res.error) {
      fail();
      return toast(t('No se pudo preparar «{name}»: {error}. Puede reintentarlo desde Ajustes.', {name: t(o.name), error: res.error}), 8000); // i18n-dynamic
    }
    if (bundledLoaded(o)) return;
    if (HAS_NATIVE) await detectRangeMode(); // el archivo ya existe: se prueba la lectura por rangos
    const rec = {id: newId(), kind: 'raster', name: t(o.name), nameKey: o.name, file: res.name, visible: true, opacity: 1, bundled: o.key, attribution: o.attribution}; // i18n-dynamic
    const e = await addRecord(rec, {fresh: true, zoom: !!opts.zoom, size: res.size});
    if (!e) return fail();
    if (layers.some((l) => l !== e && l.rec.bundled === o.key)) {
      removeEntry(e); // ya estaba (restaurada mientras tanto): no duplicar
      return;
    }
    placeBundledRasters();
    if (opts.boundary) await ensureBoundary();
    persist();
    settings.bundledDone[o.key] = true; // solo cuando la capa quedó cargada
    settings.bundledFails[o.key] = 0;
    saveSettings();
    toast(t('{name}: lista para usar sin conexión.', {name: t(o.name)}), 4000); // i18n-dynamic
  } finally {
    orthoPending.delete(o.key);
  }
});

// ---------------------------------------------------------------------------
// Datos de demostración (empaquetados en la app)
const DEMO = [
  {name: N_('Ejemplo · cancha de EARTH (área)'), url: 'demo/cancha_futbol_EARTH.geojson', color: '#ffffff'},
  {name: N_('Ejemplo · puntos P001–P420'), url: 'demo/puntos_levantamiento.geojson', color: '#00b7ff'},
  {name: N_('Ejemplo · líneas en serpentina cada 5 m'), url: 'demo/ruta_serpentina.geojson', color: '#e6007e'},
];

async function loadDemo(force = false) {
  for (const d of DEMO) {
    if (!force && layers.some((l) => l.rec.url === d.url)) continue;
    layers.filter((l) => l.rec.url === d.url).forEach(removeEntry);
    await addRecord({id: newId(), kind: 'vector', name: t(d.name), nameKey: d.name, url: d.url, color: d.color, visible: d.visible !== false, opacity: 1, demo: true}, {}); // i18n-dynamic
  }
  const ext = createEmpty();
  layers.filter((l) => DEMO.some((d) => d.url === l.rec.url) && l.extent).forEach((l) => extend(ext, l.extent));
  if (!isEmpty(ext)) view.fit(ext, {padding: [90, 40, 180, 40], maxZoom: 19, duration: 300});
}

/** Paquete de EARTH: ortofotos incluidas (65 MB, sin conexión) y el límite de la universidad. */
function installEarthPack({zoom = false} = {}) {
  let any = false;
  for (const o of BUNDLED_ORTHOS) {
    if ((settings.bundledFails[o.key] || 0) >= 3 && !zoom) continue;
    if (installBundled(o, {zoom, boundary: o.key === 'ortofoto_EARTH_2015'})) any = true;
  }
  if (any) toast(t('Preparando las ortofotos de EARTH para usarlas sin conexión (solo la primera vez)…'), 5000);
  return any;
}

// Nombres automáticos (capas incluidas y de ejemplo) en el idioma elegido. Las capas de versiones
// anteriores no guardaban la clave: se reconocen por su nombre original en español.
const OLD_AUTO_NAMES = {
  'Ortofoto campus EARTH · IGN 0,12 m': BUNDLED_ORTHOS[0].name,
  'Ortofoto EARTH 2015 · IGN 0,5 m': BUNDLED_ORTHOS[1].name,
  'Límite Universidad EARTH (OpenStreetMap)': BOUNDARY.name, // i18n-ok (nombre antiguo, solo para reconocerlo)
  'Demostración · cancha EARTH (polígono)': DEMO[0].name, // i18n-ok (nombre antiguo, solo para reconocerlo)
  'Demostración · puntos P001–P420': DEMO[1].name, // i18n-ok (nombre antiguo, solo para reconocerlo)
  'Demostración · ruta serpentina 5 m': DEMO[2].name, // i18n-ok (nombre antiguo, solo para reconocerlo)
};
function refreshAutoNames() {
  let changed = false;
  for (const l of layers) {
    const r = l.rec;
    if (!r.nameKey && OLD_AUTO_NAMES[r.name]) r.nameKey = OLD_AUTO_NAMES[r.name];
    if (r.nameKey) {
      const nm = t(r.nameKey); // i18n-dynamic
      if (nm !== r.name) { r.name = nm; changed = true; }
    }
  }
  if (changed) persist();
}

// ---------------------------------------------------------------------------
// Primera vez: una sola pantalla con el idioma y el lugar de trabajo (sin tutorial: la ayuda
// aparece en cada herramienta). Devuelve true si hay que recargar por cambio de idioma.
function welcome() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'intro';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    const startLang = getLang();
    let region = null;
    const render = () => {
      const langOpts = [['auto', t('Automático (idioma del teléfono)')], ...LANGS.map((l) => [l.code, l.name])];
      el.innerHTML = `<div class="intro-body">
        <div class="intro-art">${icon('layers')}</div>
        <h1>${t('Le damos la bienvenida a Mapa de Campo')}</h1>
        <p>${t('Mapas de campo que funcionan sin internet: vea dónde está sobre su propio mapa, marque puntos, mida, grabe recorridos y siga líneas con el GPS.')}</p>
        <label class="field"><span>${icon('lang')}${t('Idioma')}</span><select id="wLang">${langOpts.map(([v, n]) => `<option value="${v}" ${settings.lang === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <div class="field"><span>${t('¿Dónde va a trabajar?')}</span>
          <div class="choice">
            <button type="button" class="list-row ${region === 'other' ? 'on' : ''}" data-r="other" aria-pressed="${region === 'other'}">${icon('globe')}<span><b>${t('En cualquier lugar')}</b><small>${t('Empiece con el mapa del mundo de OpenStreetMap (necesita internet) y cargue sus propios mapas para usarlos sin conexión.')}</small></span></button>
            <button type="button" class="list-row ${region === 'earth' ? 'on' : ''}" data-r="earth" aria-pressed="${region === 'earth'}">${icon('layers')}<span><b>${t('En la Universidad EARTH (Costa Rica)')}</b><small>${t('Además agrega las ortofotos de EARTH para usarlas sin conexión (65 MB) y datos de ejemplo.')}</small></span></button>
          </div>
        </div>
      </div>
      <div class="intro-foot"><span class="muted text-sm" style="flex:1">${t('Puede cambiarlo después en Ajustes.')}</span><button class="btn primary big" id="wGo" ${region ? '' : 'disabled'}>${t('Empezar')}</button></div>`;
      el.querySelector('#wLang').onchange = (e) => {
        settings.lang = e.target.value;
        saveSettings();
        setLang(settings.lang);
        translateDom();
        render();
      };
      el.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { region = b.dataset.r; render(); }));
      el.querySelector('#wGo').onclick = () => {
        settings.region = region;
        settings.firstRun = false;
        settings.setupDone = false; // la preparación inicial todavía no se hizo
        saveSettings();
        el.remove();
        resolve(getLang() !== startLang);
      };
    };
    render();
    document.body.appendChild(el);
  });
}

// Tarjeta para empezar: aparece mientras no haya mapas ni datos propios.
function updateStartCard() {
  const card = $('#startCard');
  if (!card) return;
  const own = layers.some((l) => !l.rec.demo && !l.rec.bundled);
  if (own && !settings.startCardDone) {
    settings.startCardDone = true;
    saveSettings();
  }
  const show = !own && !settings.startCardDone && !settings.firstRun;
  card.hidden = !show;
  if (!show) return;
  card.innerHTML = `<h3>${t('Cargue su mapa')}</h3>
    <p>${t('Abra una imagen georreferenciada (GeoTIFF de dron u ortofoto) o sus datos (KML, GeoJSON, GPX, CSV). Quedan en el teléfono y funcionan sin internet.')}</p>
    <div class="row-actions"><button class="btn primary small" data-a="open">${icon('folder')} ${t('Abrir archivo')}</button><button class="btn text small" data-a="hide">${t('Ahora no')}</button></div>`;
  card.onclick = (e) => {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'open') startImport();
    settings.startCardDone = true;
    saveSettings();
    card.hidden = true;
  };
}

// ---------------------------------------------------------------------------
// Arranque
async function init() {
  document.body.classList.toggle('native', HAS_NATIVE);
  applySettings();
  updateGpsUi();
  if (HAS_NATIVE) console.log('Mapa de Campo: lectura por rangos =', await detectRangeMode(), '· WebGL =', webglAvailable());
  // Primera vez: idioma y lugar de trabajo. Si se cambió el idioma, se recarga para aplicarlo en todo.
  if (settings.firstRun) {
    if (await welcome()) return location.reload();
    applySettings();
  }
  // Restaura capas guardadas (en orden inverso para respetar el apilado)
  const recs = loadLayers();
  restoringLayers = true;
  try {
    for (const rec of [...recs].reverse()) await addRecord(rec, {});
  } finally {
    restoringLayers = false;
  }
  refreshAutoNames();
  // Archivos viejos de capas convertidas a GeoJSON editable, si quedaron pendientes
  let cleaned = false;
  for (const l of layers) {
    const old = l.rec.replaced;
    if (!old) continue;
    if (HAS_NATIVE && !layers.some((x) => x.rec.file === old)) call('deleteFile', old);
    delete l.rec.replaced;
    cleaned = true;
  }
  persist(); // lista completa, una sola vez, después de restaurar
  bundledReady = true;
  // Preparación inicial según el lugar de trabajo (una sola vez)
  if (!settings.setupDone) {
    if (settings.region === 'earth') {
      await loadDemo();
    } else if (!settings.basemap || settings.basemap === 'none') {
      settings.basemap = 'osm'; // fuera de EARTH, un mapa del mundo para orientarse (con internet)
      applyBasemap();
    }
    settings.setupDone = true;
    saveSettings();
  }
  // Ortofotos de EARTH: se instalan solas solo para quien trabaja en EARTH (tras 3 fallos seguidos,
  // solo desde Ajustes). El límite de EARTH se agrega con la primera instalación de la de 0,5 m.
  if (settings.region === 'earth') {
    for (const o of BUNDLED_ORTHOS) {
      if (settings.bundledDone[o.key] || (settings.bundledFails[o.key] || 0) >= 3) continue;
      if (installBundled(o, {boundary: o.key === 'ortofoto_EARTH_2015'})) {
        toast(t('Preparando las ortofotos de EARTH para usarlas sin conexión (solo la primera vez)…'), 5000);
      }
    }
  }
  updateStartCard();
  // Retoma la navegación interrumpida
  const n = loadNav();
  if (n && n.mode === 'line' && n.coords) nav.startLine(n.coords, n.name, {reverse: n.reverse, layerId: n.layerId});
  else if (n && n.mode === 'points') {
    const l = layers.find((x) => x.rec.id === n.layerId);
    if (l && l.layer) {
      const list = pointsOfLayer(l).map(({ll, name, line}) => ({ll, name, line}));
      const byName = n.target !== undefined && n.target !== null ? list.findIndex((pt) => pt.name === n.target) : -1;
      nav.startPoints(list, n.name, {layerId: n.layerId, startIndex: byName >= 0 ? byName : Math.min(n.index || 0, Math.max(0, list.length - 1))});
    }
  }
  // GPS: sin preguntar si ya hay permiso; si no, se pide al usar una herramienta que lo necesita
  // (o ahora mismo, explicando para qué, si es la primera vez que se abre la app).
  const perm = HAS_NATIVE ? call('getLocationPermission') : 'granted';
  if (perm === 'granted' || perm === 'approximate') gps.start();
  else if (perm === 'unknown' && !settings.locationAsked) {
    settings.locationAsked = true;
    saveSettings();
    ensureLocation();
  }
  updateGpsUi();
  call('appReady');
}

init();

// Para pruebas desde la consola del navegador
window.__mc = {map, gps, nav, layers, track, waypoints, measure, settings, importFromFiles, transform: olTransform, planner, basemap, editor};
