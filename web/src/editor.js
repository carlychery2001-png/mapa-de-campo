// Edición de capas en el campo: agregar puntos, líneas y áreas (tocando el mapa, con el GPS,
// caminando, por coordenadas o a distancia y azimut), cambiar su forma, moverlos, cortarlos,
// invertirlos, duplicarlos y borrarlos, editar sus datos, «imán» (snapping) a las demás capas,
// deshacer/rehacer y exportar. Cada cambio se guarda solo.
//
// Barra de edición (#editBar), pensada para un teléfono de 320 px y para usar con guantes:
// - arriba, siempre a la vista: «Deshacer», el nombre de la capa con el estado del guardado,
//   «Más» y «Listo» (terminar la edición);
// - en medio, una frase que dice qué tocar ahora (o qué se acaba de hacer, con «Deshacer» resaltado);
// - abajo, de 2 a 4 herramientas que cambian según el momento (nada, algo elegido, dibujando,
//   promediando). Es una rejilla que reparte el ancho: nunca se desplaza de lado.
//
// Datos: las claves de los atributos no dependen del idioma (nombre, fecha, fuente, precision_m,
// h_elipsoidal_m, dispersion_m, lecturas, avg_s, dist_m, az_deg) y «fuente» guarda códigos
// (gps, gps_avg, map, coords, bearing). La interfaz muestra etiquetas traducidas.

import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import Collection from 'ol/Collection.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import KML from 'ol/format/KML.js';
import GPX from 'ol/format/GPX.js';
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import Translate from 'ol/interaction/Translate.js';
import Snap from 'ol/interaction/Snap.js';
import {singleClick, noModifierKeys} from 'ol/events/condition.js';
import {getCenter, isEmpty} from 'ol/extent.js';
import {Style, Stroke, Fill, Circle as CircleStyle} from 'ol/style.js';
import {toLL, fromLL, VIEW_PROJ} from './formats.js';
import {lengthLL, areaLL} from './tools.js';
import {fmtDist, fmtArea} from './geodesy.js';
import {fromWgs84, toWgs84, utmZone, inCostaRica} from './crs.js';
import {settings, saveSettings} from './store.js';
import {$, icon, esc, toast, openSheet, closeSheet, dialog, confirmDialog, promptDialog} from './ui.js';
import {t, tn, N_, fmtNum, fmtDateTime, parseLocaleNumber, locale} from './i18n.js';
import {
  nextName, nextNumericId, renumberNames, parseAngle, parseNumber, pointAtDistanceBearing, splitLineCoords, fieldsOf, coerceValue,
  isNumberText, toBool, cleanFieldName, safeFileName, isoDate, averageFixes, sourceCode, gpxTypedProps, HIDDEN_PROPS,
} from './editgeo.js';

const EDIT_DEFAULTS = {snap: true, snapTol: 16, formOnAdd: false, multi: false, streamM: 2, avgSec: 10, warnAcc: 10};
const MAX_HISTORY = 40;
const FALLBACK_PREFIX = {Point: 'P', LineString: 'L', Polygon: 'A'};
const geojson = new GeoJSON();

// Fuerza del imán (tolerancia en píxeles de pantalla)
const SNAP_LEVELS = [['low', N_('Baja'), 10], ['mid', N_('Media'), 16], ['high', N_('Alta'), 26]];

// Colores para capas nuevas (el primero es el de siempre; ninguno se parece a la selección)
const COLORS = [
  ['#ff8f00', N_('Naranja')], ['#e6007e', N_('Magenta')], ['#00b7ff', N_('Celeste')], ['#7c4dff', N_('Morado')],
  ['#00c853', N_('Verde')], ['#ffeb3b', N_('Amarillo')], ['#212121', N_('Negro')], ['#ffffff', N_('Blanco')],
];

// Etiquetas de las claves conocidas (la clave guardada no cambia; solo se traduce lo que se ve)
const KEY_LABELS = {
  nombre: N_('Nombre'), name: N_('Nombre'), fecha: N_('Fecha y hora'), fuente: N_('Origen'),
  precision_m: N_('Precisión (± m)'), h_elipsoidal_m: N_('Altura elipsoidal (m)'), dispersion_m: N_('Dispersión (m)'),
  lecturas: N_('Lecturas GPS'), avg_s: N_('Tiempo de promedio (s)'), dist_m: N_('Distancia (m)'), az_deg: N_('Azimut (°)'),
  id: N_('Número (id)'), z: N_('Altura (m)'), codigo: N_('Código'), code: N_('Código'), linea: N_('Línea'),
  nota: N_('Nota'), note: N_('Nota'), descripcion: N_('Descripción'), description: N_('Descripción'),
};
const SOURCE_LABELS = {gps: N_('GPS'), gps_avg: N_('GPS promediado'), map: N_('Tocado en el mapa'), coords: N_('Coordenadas escritas'), bearing: N_('Distancia y azimut')};
// Datos que pone la app al tomar el elemento: se muestran aparte y sin editar («Datos de la toma»)
const CAPTURE_KEYS = ['fuente', 'fecha', 'precision_m', 'dispersion_m', 'lecturas', 'avg_s', 'h_elipsoidal_m', 'dist_m', 'az_deg'];

// ---------------------------------------------------------------- estilos del mapa
// La selección se ve distinta de cualquier color de capa: borde negro grueso, núcleo blanco y
// trazo cian discontinuo (forma, no solo color). Las esquinas son puntos blancos grandes con
// borde negro; en «Editar forma», un punto gris en medio de cada lado crea otra esquina.
const HALO = 'rgba(0, 0, 0, 0.85)';
const SEL_CYAN = '#00e5ff';
const SEL_BASE = [
  new Style({
    stroke: new Stroke({color: HALO, width: 12}),
    fill: new Fill({color: 'rgba(0, 229, 255, 0.16)'}),
    image: new CircleStyle({radius: 17, stroke: new Stroke({color: HALO, width: 9})}),
  }),
  new Style({stroke: new Stroke({color: '#ffffff', width: 6}), image: new CircleStyle({radius: 17, stroke: new Stroke({color: '#ffffff', width: 5})})}),
  new Style({stroke: new Stroke({color: SEL_CYAN, width: 3, lineDash: [10, 8]}), image: new CircleStyle({radius: 17, stroke: new Stroke({color: SEL_CYAN, width: 2.5, lineDash: [6, 5]})})}),
];

/** Líneas y anillos de una geometría (listas de coordenadas). */
function partsOf(g) {
  const ty = g.getType();
  const c = g.getCoordinates();
  if (ty === 'LineString') return [c];
  if (ty === 'Polygon' || ty === 'MultiLineString') return c;
  if (ty === 'MultiPolygon') return c.flat();
  return [];
}
const VERTEX_STYLE = new Style({
  image: new CircleStyle({radius: 7, fill: new Fill({color: '#ffffff'}), stroke: new Stroke({color: '#000000', width: 3})}),
  geometry: (f) => {
    const g = f.getGeometry();
    if (!g || typeof g.getCoordinates !== 'function') return null;
    const flat = partsOf(g).flat();
    return flat.length ? new MultiPoint(flat) : null;
  },
});
const MID_STYLE = new Style({
  image: new CircleStyle({radius: 5.5, fill: new Fill({color: '#9e9e9e'}), stroke: new Stroke({color: '#000000', width: 2})}),
  geometry: (f) => {
    const g = f.getGeometry();
    if (!g || typeof g.getCoordinates !== 'function') return null;
    const mids = [];
    for (const part of partsOf(g)) for (let i = 0; i + 1 < part.length; i++) mids.push([(part[i][0] + part[i + 1][0]) / 2, (part[i][1] + part[i + 1][1]) / 2]);
    return mids.length ? new MultiPoint(mids) : null;
  },
});
const SEL_STYLE = [...SEL_BASE, VERTEX_STYLE];
const SEL_STYLE_RESHAPE = [...SEL_BASE, MID_STYLE, VERTEX_STYLE];
// Dibujo en curso: amarillo con borde negro (se ve sobre ortofoto y sobre mapa claro)
const SKETCH_STYLE = [
  new Style({stroke: new Stroke({color: HALO, width: 7}), fill: new Fill({color: 'rgba(255, 235, 59, 0.2)'})}),
  new Style({stroke: new Stroke({color: '#ffeb3b', width: 3.5}), image: new CircleStyle({radius: 8, fill: new Fill({color: '#ffeb3b'}), stroke: new Stroke({color: '#000000', width: 3})})}),
];
// Punto que se está arrastrando en «Editar forma»
const GRAB_STYLE = new Style({image: new CircleStyle({radius: 11, fill: new Fill({color: 'rgba(0, 229, 255, 0.6)'}), stroke: new Stroke({color: '#000000', width: 3})})});

// ---------------------------------------------------------------- iconos propios del editor
const EP = {
  walk: 'M13 6a2 2 0 110-4 2 2 0 010 4zM11.5 8L10 14l3 3v5M10 14l-3 7M7 11l4.5-3 2.5 3 3 1',
  pause: 'M9 5v14M15 5v14',
  flag: 'M5 21V4M5 4h12l-3 4 3 4H5',
  vminus: 'M3 19l4.8-7.5M10.2 11.5L15 19M9 12a2 2 0 110-4 2 2 0 010 4zM15 5h6',
  data: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.01',
};
function eicon(name) {
  if (!EP[name]) return icon(name);
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${EP[name]}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ---------------------------------------------------------------- ayudas
const typeOf = (f) => (f.getGeometry() ? f.getGeometry().getType() : '');
const isLine = (f) => /LineString/.test(typeOf(f));
const isPoly = (f) => /Polygon/.test(typeOf(f));
const isPoint = (f) => /Point/.test(typeOf(f));
const baseType = (f) => (isPoint(f) ? 'Point' : isLine(f) ? 'LineString' : isPoly(f) ? 'Polygon' : null);
const TOOL_OF = {Point: 'point', LineString: 'line', Polygon: 'polygon'};

function onlyTypeMsg(g) {
  if (g === 'Point') return t('Esta capa es solo de puntos.');
  if (g === 'LineString') return t('Esta capa es solo de líneas.');
  return t('Esta capa es solo de áreas.');
}
function typeName(f) {
  const b = baseType(f);
  return b === 'Point' ? t('Punto') : b === 'LineString' ? t('Línea') : t('Área');
}
const typeIcon = (f) => ({Point: 'pin', LineString: 'line', Polygon: 'poly'})[baseType(f)] || 'info';

/** Lista con la conjunción del idioma («3 puntos y 2 líneas»). */
function listText(parts) {
  try {
    return new Intl.ListFormat(locale(), {style: 'long', type: 'conjunction'}).format(parts);
  } catch {
    return parts.join(', ');
  }
}
function countsText(features) {
  const n = {Point: 0, LineString: 0, Polygon: 0};
  features.forEach((f) => baseType(f) && n[baseType(f)]++);
  const parts = [];
  if (n.Point) parts.push(tn(n.Point, '{n} punto', '{n} puntos'));
  if (n.LineString) parts.push(tn(n.LineString, '{n} línea', '{n} líneas'));
  if (n.Polygon) parts.push(tn(n.Polygon, '{n} área', '{n} áreas'));
  return parts.length ? listText(parts) : t('Sin elementos');
}

/** Etiqueta para mostrar de una clave (traducida si es conocida; si no, la clave tal cual). */
function fieldLabel(k) {
  return KEY_LABELS[k] ? t(KEY_LABELS[k]) : k; // i18n-dynamic
}
function fieldLabelHtml(k) {
  return KEY_LABELS[k] ? `${esc(fieldLabel(k))}<small class="mono eb-key">${esc(k)}</small>` : esc(k);
}
/** ¿El valor lo puso la app al tomar el elemento? (si no, es un dato propio y se puede editar) */
function isCaptureValue(k, v) {
  if (!CAPTURE_KEYS.includes(k)) return false;
  if (v === null || v === undefined) return true;
  if (k === 'fuente') return sourceCode(v) !== null;
  if (k === 'fecha') return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
  return typeof v === 'number';
}
function fmtCapture(k, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'fuente') return t(SOURCE_LABELS[sourceCode(v)]); // i18n-dynamic
  if (k === 'fecha') return fmtDateTime(Date.parse(v));
  if (k === 'precision_m') return `± ${fmtNum(v, v < 10 ? 1 : 0)} m`;
  if (k === 'dispersion_m') return `${fmtNum(v, v < 10 ? 1 : 0)} m`;
  if (k === 'lecturas') return fmtNum(v, 0);
  if (k === 'avg_s') return `${fmtNum(v, 0)} s`;
  if (k === 'az_deg') return `${fmtNum(v, 1)}°`;
  return `${fmtNum(v, 2)} m`;
}
/**
 * Etiquetas de botón en 2 líneas de unos 60 px: a las palabras largas («Seleccionar»,
 * «Désélectionner») se les pone un guion opcional (U+00AD) cerca del medio, en un corte de sílaba
 * sencillo (V|CV, C|CV o C|CCV con l/r), para que se partan con guion en cualquier teléfono.
 */
const VOWEL = /[aeiouáéíóúàâêîôûãõäëïöüyAEIOUÁÉÍÓÚÀÂÊÎÔÛÃÕ]/;
const LETTER = /\p{L}/u;
function softHyphen(word) {
  if (word.length < 9 || !/^\p{L}+$/u.test(word)) return word;
  const isV = (c) => !!c && VOWEL.test(c);
  const isC = (c) => !!c && LETTER.test(c) && !VOWEL.test(c);
  let best = -1;
  for (let i = 3; i <= word.length - 3; i++) {
    const a = word[i - 1], b = word[i], c = word[i + 1], d = word[i + 2];
    const pair = (a + b).toLowerCase();
    const ok =
      (isV(a) && isC(b) && isV(c)) || // V|CV
      (isC(a) && isC(b) && isV(c) && !/^(ch|ll|rr|qu|gu|nh|lh|ph|th|sh)$/.test(pair) && !(/[lr]/i.test(b) && /[pbtdcgf]/i.test(a))) || // C|CV
      (isC(a) && /[pbtdcgf]/i.test(b) && /[lr]/i.test(c) && isV(d)); // C|CCV
    if (ok && (best < 0 || Math.abs(i - word.length / 2) < Math.abs(best - word.length / 2))) best = i;
  }
  return best < 0 ? word : `${word.slice(0, best)}­${word.slice(best)}`;
}
const softWrap = (label) => String(label).split(' ').map(softHyphen).join(' ');

const kvTable = (rows) => `<table class="kv">${rows.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</table>`;

function round(v, d) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return null;
  const k = 10 ** d;
  return Math.round(Number(v) * k) / k;
}
const accText = (acc) => fmtDist(Number(acc));

/** Mensaje claro para un fallo al escribir el archivo de la capa. */
function saveErrorReason(err) {
  const m = String((err && err.message) || err || '');
  if (/ENOSPC|no space|space left|disk full|lleno|espacio/i.test(m)) return t('No queda espacio en el teléfono.');
  if (/EACCES|EPERM|permission|denied|permiso/i.test(m)) return t('La app no tiene permiso para escribir el archivo.');
  return t('No se pudo escribir el archivo.');
}

export class Editor {
  /**
   * @param {object} ctx {map, gps, entries(), persist(entry, text), createLayer({name, geomType, color}),
   *   coordsHtml(ll, z), saveText(name, mime, text), utmCode(ll), openPlanner(), onActive(bool), onStreaming(bool)}
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.map = ctx.map;
    settings.edit = Object.assign({}, EDIT_DEFAULTS, settings.edit || {});
    this.opt = settings.edit;
    this.active = false;
    this.entry = null;
    this.tool = 'select';
    this.selected = new Collection();
    this.history = [];
    this.future = [];
    this.inter = [];
    this.snaps = [];
    this.deleteVertex = false;
    this.streaming = false;
    this.streamWait = null;
    this.avg = null; // promedio GPS en curso
    this.snack = null; // aviso de lo último que se hizo (se muestra en la barra)
    this.saveState = 'saved';
    this.layerType = 'any';
    this.overlay = new VectorLayer({
      source: new VectorSource({features: this.selected}),
      style: () => (this.tool === 'vertex' ? SEL_STYLE_RESHAPE : SEL_STYLE),
      zIndex: 900,
      updateWhileInteracting: true,
      updateWhileAnimating: true,
    });
    this.overlay.set('system', true);
    this.bar = $('#editBar');
    this.bar.addEventListener('click', (e) => this.onBarClick(e));
    this.map.on('singleclick', (e) => this.onMapClick(e));
    ctx.gps.onChange((type) => type === 'fix' && this.onFix());
  }

  // ---------------------------------------------------------------- inicio y fin
  /** Hoja para elegir qué capa editar o crear una nueva. */
  chooser() {
    const vec = this.ctx.entries().filter((e) => e.rec.kind === 'vector' && e.layer && !e.error);
    const rows = vec
      .map((e, i) => `<button type="button" class="list-row" data-i="${i}"><span class="sw" style="background:${esc(e.rec.color || '#888888')}" aria-hidden="true"></span><span class="eb-grow"><b>${esc(e.rec.name)}</b><small>${esc(countsText(e.layer.getSource().getFeatures()))}</small></span>${icon('next')}</button>`)
      .join('');
    const types = [
      ['Point', 'pin', t('Puntos'), t('Muestras, árboles, pozos')],
      ['LineString', 'line', t('Líneas'), t('Caminos, cercas, canales')],
      ['Polygon', 'poly', t('Áreas'), t('Lotes, parcelas, potreros')],
      ['any', 'layers', t('Mixta'), t('Puntos, líneas y áreas juntos')],
    ];
    const body = openSheet(
      t('Editar capas'),
      `<p class="muted small">${esc(t('Elija la capa en la que quiere agregar, mover o borrar elementos, o cree una nueva. Los cambios se guardan solos y se pueden deshacer.'))}</p>
       ${rows ? `<div class="list">${rows}</div>` : `<p class="note info">${esc(t('Aún no tiene capas para dibujar. Cree una aquí abajo o importe un archivo GeoJSON, KML, GPX o CSV.'))}</p>`}
       <h4>${esc(t('Nueva capa'))}</h4>
       <label class="field"><span>${esc(t('Nombre'))}</span><input id="nlName" type="text" maxlength="60" autocomplete="off" placeholder="${esc(t('Por ejemplo: Muestras de suelo'))}"></label>
       <div class="field"><span>${esc(t('¿Qué va a dibujar?'))}</span>
         <div class="choice" role="radiogroup" aria-label="${esc(t('Tipo de capa'))}">${types
           .map(([v, ic, name, ex], i) => `<button type="button" class="list-row ${i === 0 ? 'on' : ''}" role="radio" aria-checked="${i === 0}" data-type="${v}">${icon(ic)}<span class="eb-grow"><b>${esc(name)}</b><small>${esc(ex)}</small></span></button>`)
           .join('')}</div>
       </div>
       <div class="field"><span>${esc(t('Color'))}</span>
         <div class="swatches" role="radiogroup" aria-label="${esc(t('Color'))}">${COLORS.map(([c, n], i) => `<button type="button" class="sw eb-sw ${i === 0 ? 'on' : ''}" role="radio" aria-checked="${i === 0}" data-color="${c}" style="background:${c}" aria-label="${esc(t(n))}">${icon('check')}</button>`).join('') /* i18n-dynamic */}</div>
       </div>
       <div class="row-actions"><button type="button" class="btn primary big block" data-a="new">${icon('plus')}${esc(t('Crear y empezar'))}</button></div>`,
    );
    let geomType = 'Point';
    let color = COLORS[0][0];
    const pick = (sel, attr, value) =>
      body.querySelectorAll(sel).forEach((b) => {
        const on = b.dataset[attr] === value;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      });
    body.addEventListener('click', async (e) => {
      const row = e.target.closest('[data-i]');
      if (row) {
        closeSheet();
        return this.start(vec[Number(row.dataset.i)]);
      }
      const ty = e.target.closest('[data-type]');
      if (ty) return pick('[data-type]', 'type', (geomType = ty.dataset.type));
      const co = e.target.closest('[data-color]');
      if (co) return pick('[data-color]', 'color', (color = co.dataset.color));
      if (e.target.closest('[data-a="new"]')) {
        const name = $('#nlName').value.trim() || t('Capa {date}', {date: isoDate()});
        const entry = await this.ctx.createLayer({name, geomType, color});
        if (!entry) return;
        closeSheet();
        this.start(entry, {tool: entry.rec.geomType === 'any' ? 'select' : TOOL_OF[entry.rec.geomType]});
      }
    });
  }

  /**
   * Empieza a editar una capa.
   * @param {object} entry entrada de capa vectorial
   * @param {{select?: Feature, tool?: string}} [o]
   */
  async start(entry, o = {}) {
    if (this.active) {
      const ok = await this.stop(); // termina (y guarda) la edición anterior antes de empezar otra
      if (ok === false) return;
    }
    if (!entry || !entry.layer || entry.rec.kind !== 'vector') return toast(t('Esta capa no se puede editar: solo se editan capas de puntos, líneas o áreas.'), 4000);
    this.entry = entry;
    this.source = entry.layer.getSource();
    this.active = true;
    this.history = [];
    this.future = [];
    this.dirty = false;
    this.saveState = 'saved';
    this.snack = null;
    this.layerType = this.inferType();
    if (!entry.layer.getVisible()) {
      entry.layer.setVisible(true);
      entry.rec.visible = true;
    }
    if (!this.map.getLayers().getArray().includes(this.overlay)) this.map.addLayer(this.overlay);
    this.ctx.onActive(true);
    this.bar.hidden = false;
    this.setTool(o.tool || 'select');
    if (o.select) {
      this.selected.clear();
      if (!baseType(o.select)) toast(t('Este elemento mezcla varios tipos de forma y no se puede editar aquí.'), 4000);
      else {
        this.selected.push(o.select);
        this.featurePanel();
      }
      this.render();
    }
  }

  /** Tipo de la capa: el que se eligió al crearla o, en capas importadas, el de sus elementos. */
  inferType() {
    const g = this.entry.rec.geomType;
    if (g) return g;
    const types = new Set(this.source.getFeatures().map(baseType).filter(Boolean));
    return types.size === 1 ? [...types][0] : 'any';
  }

  shownTypes() {
    return this.layerType === 'any' ? ['Point', 'LineString', 'Polygon'] : [this.layerType];
  }

  /**
   * Termina la edición. Una línea o un área a medio dibujar con puntos suficientes se guarda,
   * y un promedio GPS en curso se guarda con las lecturas que ya llegaron (no se pierde nada).
   * Si el guardado falla, la edición sigue abierta para no perder cambios y devuelve false.
   * @returns {Promise<boolean>}
   */
  async stop() {
    if (!this.active) return true;
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      if (this.avg) this.finishAveraging(true);
      if (this.drawing && this.sketchOk()) {
        const fo = this.opt.formOnAdd;
        this.opt.formOnAdd = false; // la edición se está cerrando: no abrir la ficha del dibujo guardado
        try {
          this.draw.finishDrawing();
        } finally {
          this.opt.formOnAdd = fo;
        }
      } else this.abortDrawing();
      this.setStreaming(false);
      let ok = await this.flush();
      while (ok && this.dirty) ok = await this.flush(); // cambios hechos mientras se guardaba
      if (!ok) {
        toast(t('No se pudo guardar la capa, así que la edición sigue abierta para no perder cambios. Libere espacio en el teléfono y toque «Listo» otra vez.'), 7000);
        return false;
      }
      clearTimeout(this.snackTimer);
      this.snack = null;
      this.clearInteractions();
      this.selected.clear();
      this.active = false;
      this.entry = null;
      this.source = null;
      this.bar.hidden = true;
      this.bar.innerHTML = '';
      this.map.removeLayer(this.overlay);
      this.ctx.onActive(false);
      return true;
    })();
    try {
      return await this.stopping;
    } finally {
      this.stopping = null;
    }
  }

  /** «Listo»: guarda todo y sale de la edición. */
  finish() {
    closeSheet();
    return this.stop().then((ok) => {
      if (ok) toast(t('Edición terminada. Todo quedó guardado.'), 3000);
      return ok;
    });
  }

  /**
   * Botón «atrás» de Android, paso a paso: promedio → dibujo (pide confirmar) → caminar →
   * herramienta → selección → terminar la edición.
   */
  onBack() {
    if (!this.active) return false;
    if (this.avg) {
      this.cancelAveraging(true);
      return true;
    }
    if (this.drawing) {
      this.confirmAbort();
      return true;
    }
    if (this.streaming) {
      this.setStreaming(false);
      this.render();
      return true;
    }
    if (this.tool !== 'select') {
      this.setTool('select');
      return true;
    }
    if (this.selected.getLength()) {
      this.clearSelection();
      return true;
    }
    this.finish();
    return true;
  }

  /** Puntos reales del dibujo en curso (el último punto del boceto sigue al dedo). */
  sketchVertices() {
    if (!this.drawing) return 0;
    const g = this.drawing.getGeometry();
    if (g.getType() === 'LineString') return Math.max(0, g.getCoordinates().length - 1);
    if (g.getType() === 'Polygon') return Math.max(0, (g.getCoordinates()[0] || []).length - 2);
    return 0;
  }

  sketchOk() {
    const n = this.sketchVertices();
    return this.tool === 'line' ? n >= 2 : this.tool === 'polygon' ? n >= 3 : false;
  }

  /** Descartar el dibujo en curso: con 2 o más puntos (o caminando) pide confirmación. */
  confirmAbort() {
    const n = this.sketchVertices();
    const go = () => {
      this.setStreaming(false);
      this.abortDrawing();
      this.render();
    };
    if (!this.drawing || (n < 2 && !this.streaming)) return go();
    const msg = this.tool === 'line'
      ? tn(n, '¿Descartar la línea que está dibujando ({n} punto)? No se puede deshacer.', '¿Descartar la línea que está dibujando ({n} puntos)? No se puede deshacer.')
      : tn(n, '¿Descartar el área que está dibujando ({n} esquina)? No se puede deshacer.', '¿Descartar el área que está dibujando ({n} esquinas)? No se puede deshacer.');
    confirmDialog(t('Descartar el dibujo'), msg, t('Descartar'), true).then((ok) => ok && go());
  }

  setStreaming(on) {
    if (this.streaming === on) return;
    this.streaming = on;
    this.streamWait = null;
    if (this.ctx.onStreaming) this.ctx.onStreaming(on); // mantiene la pantalla encendida mientras graba
  }

  // ---------------------------------------------------------------- herramientas
  /** ¿La capa admite este tipo? (solo si se eligió al crearla; las importadas admiten todo) */
  allowed(type) {
    const g = this.entry && this.entry.rec.geomType;
    return !g || g === 'any' || g === type;
  }

  clearInteractions() {
    for (const i of [...this.inter, ...this.snaps]) this.map.removeInteraction(i);
    this.inter = [];
    this.snaps = [];
  }

  setTool(tool) {
    if (!this.active) return;
    this.abortDrawing();
    const sel = this.selected.getArray();
    if ((tool === 'vertex' || tool === 'move') && !sel.length) {
      toast(t('Primero toque en el mapa el elemento que quiere cambiar.'), 4000);
      tool = 'select';
    }
    if (tool === 'vertex' && sel.every(isPoint)) {
      toast(t('Los puntos no tienen forma que editar: arrástrelos con «Mover».'), 4000);
      tool = 'move';
    }
    if (tool === 'split' && !(sel.length === 1 && typeOf(sel[0]) === 'LineString')) {
      toast(t('Para cortar, primero toque una sola línea.'), 4000);
      tool = 'select';
    }
    this.clearInteractions();
    this.tool = tool;
    this.deleteVertex = false;
    if (tool === 'point' || tool === 'line' || tool === 'polygon') {
      const type = {point: 'Point', line: 'LineString', polygon: 'Polygon'}[tool];
      // Mientras se dibuja caminando, los puntos los pone el GPS: un toque en el mapa no agrega nada
      const draw = new Draw({type, style: SKETCH_STYLE, stopClick: true, condition: (e) => !this.streaming && noModifierKeys(e)});
      draw.on('drawstart', (e) => {
        this.drawing = e.feature;
        this.lastStream = null;
        // La medida cambia con el dedo; los botones («Terminar», «Deshacer») solo cuando cambia el número de puntos
        let nPts = -1;
        e.feature.getGeometry().on('change', () => {
          const n = this.sketchVertices();
          if (n !== nPts) {
            nPts = n;
            this.render();
          } else this.renderHint();
        });
        this.render();
      });
      draw.on('drawend', (e) => {
        this.drawing = null;
        const gps = this.streaming || this.gpsVertices > 0;
        this.setStreaming(false);
        this.addFeature(e.feature, {fuente: gps ? 'gps' : 'map'});
        this.gpsVertices = 0;
        this.render();
      });
      draw.on('drawabort', () => {
        this.drawing = null;
        this.gpsVertices = 0;
        this.setStreaming(false);
        this.render();
      });
      this.draw = draw;
      this.inter.push(draw);
    } else if (tool === 'vertex') {
      const mod = new Modify({
        features: this.selected,
        pixelTolerance: 24,
        style: GRAB_STYLE,
        deleteCondition: (e) => this.deleteVertex && singleClick(e),
        insertVertexCondition: () => !this.deleteVertex, // en «Quitar esquina», tocar un lado no agrega esquinas
      });
      this.trackChange(mod, 'modifystart', 'modifyend', () => t('Editar forma de {name}', {name: this.label(this.selected.item(0))}));
      this.inter.push(mod);
    } else if (tool === 'move') {
      const tr = new Translate({features: this.selected, hitTolerance: 24});
      this.trackChange(tr, 'translatestart', 'translateend', () =>
        this.selected.getLength() > 1 ? tn(this.selected.getLength(), 'Mover {n} elemento', 'Mover {n} elementos') : t('Mover {name}', {name: this.label(this.selected.item(0))}),
      );
      this.inter.push(tr);
    }
    this.inter.forEach((i) => this.map.addInteraction(i));
    this.addSnaps();
    this.overlay.changed();
    this.render();
  }

  /** Un paso de historial solo si el gesto cambió algo (tocar sin arrastrar no cuenta). */
  trackChange(inter, startEv, endEv, what) {
    let pre = null;
    inter.on(startEv, () => (pre = this.snapshot()));
    inter.on(endEv, () => {
      if (pre !== null && this.snapshot() !== pre) {
        this.history.push({s: pre, what: what()});
        if (this.history.length > MAX_HISTORY) this.history.shift();
        this.future = [];
        this.changed();
      }
      pre = null;
    });
  }

  /** Imán: lo que se dibuja o arrastra se pega a esquinas y bordes de esta capa y de las demás visibles. */
  addSnaps() {
    if (!this.opt.snap || this.tool === 'select' || this.tool === 'split') return;
    const sources = [this.source];
    for (const e of this.ctx.entries()) {
      if (e === this.entry || e.rec.kind !== 'vector' || !e.layer || !e.layer.getVisible()) continue;
      sources.push(e.layer.getSource());
    }
    for (const src of sources) {
      const s = new Snap({source: src, pixelTolerance: Number(this.opt.snapTol) || 16});
      this.snaps.push(s);
      this.map.addInteraction(s); // el imán va después de las demás interacciones
    }
  }

  abortDrawing() {
    if (this.drawing && this.draw) this.draw.abortDrawing();
    this.drawing = null;
    this.setStreaming(false);
  }

  // ---------------------------------------------------------------- toques en el mapa
  onMapClick(e) {
    if (!this.active) return;
    if (this.streaming) return toast(t('Está dibujando caminando: los puntos los pone el GPS. Toque «Pausar» para poner puntos a mano.'), 3500);
    if (this.drawing || this.avg) return;
    if (this.tool === 'split') return this.splitAt(e.coordinate);
    if (this.tool !== 'select') return;
    const hits = [];
    this.map.forEachFeatureAtPixel(e.pixel, (f) => {
      if (!hits.includes(f)) hits.push(f);
      return hits.length >= 8;
    }, {layerFilter: (l) => l === this.entry.layer, hitTolerance: 18});
    const ok = hits.filter(baseType);
    if (hits.length && !ok.length) toast(t('Este elemento mezcla varios tipos de forma y no se puede editar aquí.'), 4000);
    if (!ok.length) {
      if (!hits.length) this.hintOtherLayer(e.pixel);
      if (!this.opt.multi) this.clearSelection();
      return;
    }
    if (this.opt.multi) {
      const f = ok[0];
      if (this.selected.getArray().includes(f)) this.selected.remove(f);
      else this.selected.push(f);
      return this.render(); // sin abrir la ficha: así no tapa lo que se va a tocar después
    }
    if (ok.length > 1) return this.pickFeature(ok);
    this.selectOne(ok[0]);
  }

  /** Un toque en otra capa: explica que solo se edita la capa elegida. */
  hintOtherLayer(pixel) {
    let other = null;
    const mine = this.entry.layer;
    this.map.forEachFeatureAtPixel(pixel, (f, l) => (other = l), {
      layerFilter: (l) => l !== mine && l !== this.overlay && this.ctx.entries().some((e) => e.layer === l && e.rec.kind === 'vector'),
      hitTolerance: 12,
    });
    if (other) toast(t('Solo se editan los elementos de «{layer}». Para cambiar otra capa, toque «Listo» y elíjala.', {layer: this.entry.rec.name}), 4500);
  }

  selectOne(f) {
    this.selected.clear();
    this.selected.push(f);
    this.featurePanel();
    this.render();
  }

  clearSelection() {
    this.selected.clear();
    closeSheet();
    if (this.tool !== 'select') return this.setTool('select');
    this.render();
  }

  /** Varios elementos bajo el dedo: lista para elegir cuál. */
  pickFeature(list) {
    const rows = list
      .map((f, i) => `<button type="button" class="list-row" data-k="${i}">${icon(typeIcon(f))}<span class="eb-grow"><b>${esc(this.label(f))}</b><small>${esc(typeName(f))}</small></span></button>`)
      .join('');
    const body = openSheet(t('¿Cuál de estos?'), `<p class="muted small">${esc(t('Hay varios elementos en ese lugar. Elija uno.'))}</p><div class="list">${rows}</div>`);
    body.addEventListener('click', (e) => {
      const r = e.target.closest('[data-k]');
      if (r && this.active) this.selectOne(list[Number(r.dataset.k)]);
    });
  }

  // ---------------------------------------------------------------- historial y guardado
  /** Elementos en el orden de la capa (el del archivo; los nuevos al final). */
  ordered() {
    return this.source
      .getFeatures()
      .map((f, i) => [f, f.ordinal ?? Number.MAX_SAFE_INTEGER, i])
      .sort((a, b) => a[1] - b[1] || a[2] - b[2])
      .map((x) => x[0]);
  }

  nextOrdinal() {
    let m = -1;
    for (const f of this.source.getFeatures()) if (Number.isFinite(f.ordinal)) m = Math.max(m, f.ordinal);
    return m + 1;
  }

  snapshot() {
    return geojson.writeFeatures(this.ordered());
  }

  /** Guarda el estado de antes de un cambio; `what` describe el cambio («Borrar P012»). */
  pushHistory(what) {
    this.history.push({s: this.snapshot(), what: what || ''});
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.future = [];
  }

  restore(str) {
    this.selected.clear();
    this.source.clear();
    const fs = geojson.readFeatures(str);
    fs.forEach((f, i) => (f.ordinal = i));
    this.source.addFeatures(fs);
  }

  undo() {
    if (this.drawing) {
      this.draw.removeLastPoint();
      return this.render();
    }
    if (!this.history.length) return toast(t('No hay nada que deshacer.'));
    const h = this.history.pop();
    this.future.push({s: this.snapshot(), what: h.what});
    this.restore(h.s);
    closeSheet();
    this.afterRestore();
    this.flashSnack(h.what ? t('Deshecho: {what}', {what: h.what}) : t('Deshecho.'));
  }

  redo() {
    if (!this.future.length) return toast(t('No hay nada que rehacer.'));
    const h = this.future.pop();
    this.history.push({s: this.snapshot(), what: h.what});
    this.restore(h.s);
    closeSheet();
    this.afterRestore();
    this.flashSnack(h.what ? t('Rehecho: {what}', {what: h.what}) : t('Rehecho.'));
  }

  afterRestore() {
    if (this.tool === 'vertex' || this.tool === 'move' || this.tool === 'split') this.setTool('select'); // la selección se vació
    this.changed();
  }

  /**
   * Aviso en la barra de lo que se acaba de hacer (unos 6 s). Con `undoable`, «Deshacer» se
   * resalta para que se vea cómo volver atrás.
   */
  flashSnack(text, undoable = false) {
    clearTimeout(this.snackTimer);
    this.snack = {text, undoable};
    this.snackTimer = setTimeout(() => {
      this.snack = null;
      this.renderHint();
      const u = this.bar.querySelector('[data-t="undo"]');
      if (u) u.classList.remove('pulse');
    }, 6000);
    this.render();
  }

  /** Después de cada cambio: guardar (con una pequeña espera) y actualizar la barra. */
  changed() {
    this.dirty = true;
    this.setSave('pending');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 600);
    if (this.entry) this.entry.extent = this.source.getExtent();
    this.render();
  }

  setSave(state) {
    this.saveState = state;
    if (this.active) this.renderStatus();
  }

  /**
   * Guarda la capa. Los guardados van en fila; un fallo no bloquea los siguientes
   * y se reintenta solo a los 5 s. Devuelve true si quedó guardado.
   * @returns {Promise<boolean>}
   */
  async flush() {
    clearTimeout(this.saveTimer);
    if (!this.dirty || !this.entry) return true;
    const entry = this.entry;
    const text = geojson.writeFeatures(this.ordered(), {dataProjection: 'EPSG:4326', featureProjection: VIEW_PROJ, decimals: 9});
    this.dirty = false;
    this.setSave('saving');
    const job = (this.saving || Promise.resolve()).catch(() => {}).then(() => this.ctx.persist(entry, text));
    this.saving = job.catch(() => {});
    try {
      await job;
      if (this.entry === entry && !this.dirty) this.setSave('saved');
      return true;
    } catch (err) {
      if (this.entry === entry) {
        this.dirty = true;
        this.setSave('error');
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.flush(), 5000);
      }
      toast(t('No se pudo guardar la capa. {reason} Se intentará otra vez en 5 s.', {reason: saveErrorReason(err)}), 6000);
      return false;
    }
  }

  // ---------------------------------------------------------------- agregar
  nameKey() {
    const fs = this.source.getFeatures();
    if (fs.some((f) => f.get('nombre') !== undefined)) return 'nombre';
    if (fs.some((f) => f.get('name') !== undefined)) return 'name';
    return 'nombre';
  }

  /** Nombre para mostrar de un elemento. */
  label(f) {
    const v = f && f.get(this.nameKey());
    return v === null || v === undefined || v === '' ? t('(sin nombre)') : String(v);
  }

  /** Pone el nombre en el campo de nombres de la capa y, si la capa también usa el otro («name»/«nombre»), en ambos. */
  setName(f, value) {
    const key = this.nameKey();
    f.set(key, value);
    const other = key === 'nombre' ? 'name' : 'nombre';
    if (f.get(other) !== undefined || this.source.getFeatures().some((g) => g !== f && g.get(other) !== undefined)) f.set(other, value);
  }

  /** Nombre (y id, si la capa usa ids numéricos) para un elemento nuevo. */
  autoProps(type) {
    const key = this.nameKey();
    const same = this.source.getFeatures().filter((f) => baseType(f) === type);
    const props = {[key]: nextName(same.map((f) => f.get(key)), FALLBACK_PREFIX[type])};
    const all = this.source.getFeatures();
    if (type === 'Point' && all.length && all.every((f) => f.get('id') !== undefined)) {
      const id = nextNumericId(all.map((f) => f.get('id')));
      if (id !== null) props.id = id;
    }
    return props;
  }

  /**
   * Agrega un elemento a la capa (con nombre automático, fecha y origen) y lo guarda.
   * @param {Feature} f
   * @param {object} extra atributos adicionales (fuente, precision_m…)
   */
  addFeature(f, extra = {}) {
    if (!this.active || !this.source) return null;
    const type = baseType(f);
    if (!this.allowed(type)) {
      toast(onlyTypeMsg(this.entry.rec.geomType));
      return null;
    }
    const key = this.nameKey();
    const auto = this.autoProps(type);
    this.pushHistory(t('Agregar {name}', {name: auto[key]}));
    f.setProperties({...auto, fecha: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), ...extra}); // fecha en UTC, con «Z»
    this.setName(f, auto[key]);
    f.ordinal = this.nextOrdinal();
    this.source.addFeature(f);
    this.changed();
    const name = String(f.get(key));
    if (type !== 'Point') {
      const ll = this.llCoords(f);
      toast(t('Agregado: {name} · {measure}', {name, measure: type === 'Polygon' ? fmtArea(areaLL(ll)) : fmtDist(lengthLL(ll))}), 2500);
    } else if (extra.precision_m !== undefined && extra.precision_m !== null) {
      toast(t('Agregado: {name} · ±{acc}', {name, acc: accText(extra.precision_m)}), 2500);
    } else toast(t('Agregado: {name}', {name}), 1800);
    if (this.opt.formOnAdd) {
      this.selected.clear();
      this.selected.push(f);
      this.featurePanel();
    }
    return f;
  }

  addPointLL(ll, extra) {
    if (!this.allowed('Point')) return toast(onlyTypeMsg(this.entry.rec.geomType));
    return this.addFeature(new Feature(new Point(fromLL(ll))), extra);
  }

  /**
   * ¿El GPS no puede dar una posición útil por mucho que se espere? Sin permiso, con la
   * ubicación del teléfono apagada, solo aproximada o con el GPS sin encender, dice qué hacer
   * (como «Marcar») en vez de «espere al aire libre», y devuelve true.
   */
  gpsUnavailable() {
    const gps = this.ctx.gps;
    const u = gps.usability({maxAge: Infinity, maxAcc: Infinity});
    if (u.code === 'denied' || u.code === 'off' || u.code === 'approximate') {
      const text = gps.problem({maxAge: Infinity, maxAcc: Infinity}).text;
      // Sin permiso, main.js explica para qué es y lo pide (o abre los ajustes si Android ya no
      // pregunta); si no tenía nada que pedir (navegador), devuelve true y se dice qué pasa
      if (u.code === 'denied' && this.ctx.ensureLocation) {
        Promise.resolve(this.ctx.ensureLocation()).then((nothingAsked) => nothingAsked && toast(text, 6000), () => {});
      } else toast(text, 6000);
      return true;
    }
    // El GPS ni siquiera se encendió (todavía no se dio permiso, o se respondió «Ahora no»)
    if (!gps.running && !gps.sim && this.ctx.ensureLocation) {
      this.ctx.ensureLocation();
      return true;
    }
    return false;
  }

  /** Posición GPS reciente (≤ 4 s); si es vieja o no hay, avisa y devuelve null. */
  gpsFixOrWarn() {
    if (this.gpsUnavailable()) return null;
    const f = this.ctx.gps.fix;
    if (!f || this.ctx.gps.isStale()) {
      toast(f ? t('La posición GPS no está al día (el punto azul está gris). Espere unos segundos al aire libre.') : t('Todavía no hay posición GPS. Espere unos segundos al aire libre.'), 4000);
      return null;
    }
    return f;
  }

  /**
   * Posición GPS para guardar. Si la precisión es peor que el límite de Ajustes de edición,
   * muestra el ± y pregunta: guardar igual, promediar (solo para puntos) o cancelar.
   * @param {boolean} canAverage
   */
  async goodFix(canAverage) {
    const f = this.gpsFixOrWarn();
    if (!f) return null;
    const lim = Number(this.opt.warnAcc) || EDIT_DEFAULTS.warnAcc;
    if (!(Number(f.acc) > lim)) return f;
    const buttons = [{label: t('Cancelar'), value: null}];
    if (canAverage) buttons.push({label: t('Promediar'), value: 'avg'});
    buttons.push({label: t('Guardar igual'), value: 'save', primary: true});
    const r = await dialog(
      t('Precisión baja: ±{acc}', {acc: accText(f.acc)}),
      `<p>${esc(t('El punto puede quedar hasta a {acc} de donde está usted. Para mejorar la señal, vaya a cielo abierto, lejos de techos y árboles.', {acc: accText(f.acc)}))}</p>
       ${canAverage ? `<p class="muted small">${esc(t('«Promediar» junta varias lecturas durante unos segundos para un punto más estable.'))}</p>` : ''}`,
      buttons,
    );
    if (!this.active) return null;
    if (r === 'avg') {
      this.startAveraging();
      return null;
    }
    return r === 'save' ? this.gpsFixOrWarn() : null; // la posición de ahora, no la de antes de preguntar
  }

  async addGpsPoint() {
    if (!this.allowed('Point')) return toast(onlyTypeMsg(this.entry.rec.geomType));
    const f = await this.goodFix(true);
    if (!f || !this.active) return;
    this.addPointLL([f.lon, f.lat], {fuente: 'gps', precision_m: round(f.acc, 2), h_elipsoidal_m: f.alt === null || f.alt === undefined ? null : round(f.alt, 2)});
  }

  // ---------------------------------------------------------------- promedio GPS («GPS preciso»)
  /** Empieza a juntar lecturas. La barra muestra el avance con «Guardar ya» y «Cancelar». */
  startAveraging() {
    if (!this.active) return;
    if (this.avg) return toast(t('Ya se está promediando una posición.'));
    if (!this.allowed('Point')) return toast(onlyTypeMsg(this.entry.rec.geomType));
    if (!this.gpsFixOrWarn()) return;
    if (this.tool !== 'select' && this.tool !== 'point') this.setTool('select');
    closeSheet();
    const avg = {secs: Math.min(300, Math.max(2, Number(this.opt.avgSec) || 10)), start: Date.now(), fixes: [], lastTime: null, shown: ''};
    avg.handler = (type) => {
      if (type !== 'fix') return;
      const f = this.ctx.gps.fix;
      if (!f || f.time === avg.lastTime) return;
      avg.lastTime = f.time;
      avg.fixes.push(f);
    };
    this.ctx.gps.onChange(avg.handler);
    avg.timer = setInterval(() => {
      if (this.avg !== avg) return clearInterval(avg.timer);
      if (Date.now() - avg.start >= avg.secs * 1000) return this.finishAveraging(true);
      const key = `${Math.floor((Date.now() - avg.start) / 1000)}/${avg.fixes.length}`;
      if (key !== avg.shown) {
        avg.shown = key;
        this.renderHint();
        this.renderTools(); // solo cambia cuando llega la primera lectura («Guardar ya» se habilita)
      }
    }, 250);
    this.avg = avg;
    this.render();
  }

  endAveraging() {
    const avg = this.avg;
    if (!avg) return null;
    clearInterval(avg.timer);
    const ls = this.ctx.gps.listeners;
    const i = ls ? ls.indexOf(avg.handler) : -1;
    if (i >= 0) ls.splice(i, 1);
    this.avg = null;
    return avg;
  }

  /** Termina el promedio: con `save`, guarda el punto con las lecturas que hay; si no, lo descarta. */
  finishAveraging(save) {
    const avg = this.endAveraging();
    if (!avg) return null;
    if (!save) {
      toast(t('Promedio cancelado: no se guardó ningún punto.'), 3000);
      this.render();
      return null;
    }
    const res = averageFixes(avg.fixes);
    if (!res) {
      toast(t('No llegaron lecturas GPS durante el promedio. Pruebe al aire libre, lejos de techos y árboles.'), 5000);
      this.render();
      return null;
    }
    const secs = Math.min(avg.secs, Math.round((Date.now() - avg.start) / 1000));
    const f = this.addPointLL([res.lon, res.lat], {
      fuente: 'gps_avg', precision_m: round(res.acc, 2), dispersion_m: round(res.spread, 2), lecturas: res.n, avg_s: secs,
      h_elipsoidal_m: res.alt === null ? null : round(res.alt, 2),
    });
    this.render();
    return f;
  }

  /** Cancelar el promedio (con el botón «atrás» pregunta, porque es fácil tocarlo sin querer). */
  async cancelAveraging(ask) {
    if (!this.avg) return;
    if (ask && this.avg.fixes.length) {
      const avg = this.avg;
      const ok = await confirmDialog(t('¿Cancelar el promedio?'), tn(avg.fixes.length, 'Se descarta {n} lectura y no se guarda el punto.', 'Se descartan {n} lecturas y no se guarda el punto.'), t('Descartar'), true);
      if (!ok || this.avg !== avg) return;
    }
    this.finishAveraging(false);
  }

  // ---------------------------------------------------------------- GPS al dibujar
  /** Punto desde el GPS en la línea o el área que se está dibujando (o la empieza). */
  async gpsVertex() {
    const f = await this.goodFix(false);
    if (!f || !this.active || !this.draw || (this.tool !== 'line' && this.tool !== 'polygon')) return;
    this.draw.appendCoordinates([fromLL([f.lon, f.lat])]);
    this.gpsVertices = (this.gpsVertices || 0) + 1;
    this.lastStream = [f.lon, f.lat];
    this.render();
  }

  /** «Dibujar caminando» (el GPS pone los puntos al caminar) / «Pausar». */
  toggleWalk() {
    if (this.streaming) {
      this.setStreaming(false);
      this.render();
      return toast(t('En pausa. Toque el mapa o «Punto GPS» para seguir a mano, o «Dibujar caminando» para seguir grabando.'), 4500);
    }
    if (this.gpsUnavailable()) return; // no quedarse «esperando una buena posición» que nunca llega
    if (this.tool !== 'line' && this.tool !== 'polygon') {
      const types = this.shownTypes();
      if (!types.includes('LineString') && !types.includes('Polygon')) return;
      this.setTool(types.includes('LineString') ? 'line' : 'polygon');
    }
    this.setStreaming(true);
    this.onFix();
    const maxAcc = Number(settings.trackMaxAcc) || 25;
    if (!this.drawing) toast(t('Esperando una buena posición GPS para empezar…'), 3500);
    else toast(t('Camine: se agrega un punto cada {d} si la precisión es de ±{acc} o mejor.', {d: fmtDist(Number(this.opt.streamM) || 2), acc: fmtDist(maxAcc)}), 4000);
    this.render();
  }

  onFix() {
    if (!this.active || !this.streaming || !this.draw || (this.tool !== 'line' && this.tool !== 'polygon')) return;
    const f = this.ctx.gps.fix;
    if (!f || this.ctx.gps.isStale()) return;
    if (f.acc > (Number(settings.trackMaxAcc) || 25)) {
      if (this.streamWait !== f.acc) {
        this.streamWait = f.acc;
        this.renderHint();
      }
      return;
    }
    const waited = this.streamWait !== null;
    this.streamWait = null;
    const ll = [f.lon, f.lat];
    if (this.drawing && this.lastStream && lengthLL([this.lastStream, ll]) < (Number(this.opt.streamM) || 2)) {
      if (waited) this.renderHint();
      return;
    }
    this.draw.appendCoordinates([fromLL(ll)]);
    this.gpsVertices = (this.gpsVertices || 0) + 1;
    this.lastStream = ll;
    this.render();
  }

  // ---------------------------------------------------------------- operaciones sobre la selección
  deleteSelected() {
    const sel = [...this.selected.getArray()];
    if (!sel.length) return toast(t('Primero toque en el mapa el elemento que quiere borrar.'));
    const one = sel.length === 1 ? this.label(sel[0]) : '';
    const go = () => {
      this.pushHistory(sel.length === 1 ? t('Borrar {name}', {name: one}) : tn(sel.length, 'Borrar {n} elemento', 'Borrar {n} elementos'));
      sel.forEach((f) => this.source.removeFeature(f));
      this.selected.clear();
      closeSheet();
      if (this.tool !== 'select') this.setTool('select');
      this.changed();
      this.flashSnack(sel.length === 1 ? t('Borrado: {name}. «Deshacer» lo recupera.', {name: one}) : tn(sel.length, '{n} elemento borrado. «Deshacer» lo recupera.', '{n} elementos borrados. «Deshacer» los recupera.'), true);
    };
    if (sel.length === 1) return go(); // uno solo: sin preguntar, «Deshacer» queda resaltado
    confirmDialog(t('Borrar elementos'), tn(sel.length, '¿Borrar el elemento elegido? Puede recuperarlo con «Deshacer».', '¿Borrar los {n} elementos elegidos? Puede recuperarlos con «Deshacer».'), t('Borrar'), true).then((ok) => ok && go());
  }

  duplicateSelected() {
    const sel = this.selected.getArray();
    if (!sel.length) return;
    this.pushHistory(t('Duplicar'));
    const key = this.nameKey();
    const d = 16 * this.map.getView().getResolution(); // la copia queda un poco al lado, no encima
    const copies = sel.map((f) => {
      const c = f.clone();
      c.setId(undefined);
      c.getGeometry().translate(d, -d);
      const props = this.autoProps(baseType(f));
      this.setName(c, props[key]);
      if (props.id !== undefined) c.set('id', props.id);
      c.ordinal = this.nextOrdinal();
      this.source.addFeature(c);
      return c;
    });
    this.selected.clear();
    copies.forEach((c) => this.selected.push(c));
    this.changed();
    this.setTool('move');
    this.flashSnack(tn(copies.length, 'Copia creada al lado (elegida). Arrástrela a su lugar.', '{n} copias creadas al lado (elegidas). Arrástrelas a su lugar.'), true);
  }

  reverseSelected() {
    const lines = this.selected.getArray().filter(isLine);
    if (!lines.length) return toast(t('Elija una línea.'));
    this.pushHistory(t('Invertir dirección'));
    for (const f of lines) {
      const g = f.getGeometry();
      if (g.getType() === 'LineString') g.setCoordinates(g.getCoordinates().reverse());
      else g.setCoordinates(g.getCoordinates().map((c) => c.reverse()).reverse());
    }
    this.changed();
    this.flashSnack(t('Dirección invertida: ahora la línea empieza por el otro extremo.'), true);
  }

  splitAt(coord) {
    const f = this.selected.item(0);
    if (!f || typeOf(f) !== 'LineString') {
      toast(t('Solo se pueden cortar líneas simples.'));
      return this.setTool('select');
    }
    const res = splitLineCoords(f.getGeometry().getCoordinates(), coord);
    const tolMap = 30 * this.map.getView().getResolution();
    if (!res || res[2] > tolMap) return toast(t('Toque sobre la línea elegida, lejos de sus extremos.'), 3000);
    const key = this.nameKey();
    const base = f.get(key) !== undefined && f.get(key) !== null && f.get(key) !== '' ? String(f.get(key)) : nextName(this.source.getFeatures().filter(isLine).map((g) => g.get(key)), 'L');
    this.pushHistory(t('Cortar {name}', {name: base}));
    const a = f;
    const b = f.clone();
    b.setId(undefined);
    a.getGeometry().setCoordinates(res[0]);
    b.getGeometry().setCoordinates(res[1]);
    this.setName(a, `${base} a`);
    this.setName(b, `${base} b`);
    b.ordinal = (Number.isFinite(a.ordinal) ? a.ordinal : this.nextOrdinal()) + 0.5;
    this.source.addFeature(b);
    this.selected.clear();
    this.changed();
    this.setTool('select');
    this.flashSnack(t('Línea cortada en dos: «{a}» y «{b}».', {a: `${base} a`, b: `${base} b`}), true);
  }

  async moveSelectedToGps() {
    const f = this.selected.item(0);
    if (!f || typeOf(f) !== 'Point') return;
    const fix = await this.goodFix(false);
    if (!fix || !this.active || !this.source.hasFeature(f)) return;
    const name = this.label(f);
    this.pushHistory(t('Mover {name} a mi posición', {name}));
    const alt = fix.alt === null || fix.alt === undefined ? null : round(fix.alt, 2);
    f.getGeometry().setCoordinates(fromLL([fix.lon, fix.lat]));
    f.setProperties({fuente: 'gps', precision_m: round(fix.acc, 2), h_elipsoidal_m: alt});
    if (f.get('z') !== undefined) f.set('z', alt); // las dos alturas quedan iguales
    this.changed();
    this.flashSnack(t('Movido a su posición: {name} · ±{acc}.', {name, acc: accText(fix.acc)}), true);
  }

  async exactCoords() {
    const f = this.selected.item(0);
    if (!f || typeOf(f) !== 'Point') return;
    const ll = await coordDialog(t('Escribir coordenadas del punto'), toLL(f.getGeometry().getCoordinates()));
    if (!ll || !this.active || !this.source.hasFeature(f)) return;
    this.pushHistory(t('Mover {name}', {name: this.label(f)}));
    f.getGeometry().setCoordinates(fromLL(ll));
    f.set('fuente', 'coords');
    this.changed();
    this.featurePanel();
  }

  async pointByCoords() {
    const ll = await coordDialog(t('Agregar un punto por coordenadas'), toLL(this.map.getView().getCenter()));
    if (!ll || !this.active) return;
    const f = this.addPointLL(ll, {fuente: 'coords'});
    if (f) this.map.getView().animate({center: fromLL(ll), duration: 300});
  }

  async pointByBearing() {
    const sel = this.selected.item(0);
    const gpsOk = this.ctx.gps.fix && !this.ctx.gps.isStale();
    const opts = [];
    if (sel && typeOf(sel) === 'Point') opts.push(['sel', t('El punto elegido ({name})', {name: this.label(sel)})]);
    if (gpsOk) opts.push(['gps', t('Mi posición GPS')]);
    opts.push(['center', t('El centro del mapa')]);
    const h = this.ctx.gps.heading;
    const decl0 = h && Number.isFinite(h.decl) ? fmtNum(h.decl, 1) : '';
    const res = await dialog(
      t('Punto a distancia y azimut'),
      `<label class="field"><span>${esc(t('Desde'))}</span><select id="dbFrom">${opts.map(([v, txt]) => `<option value="${v}">${esc(txt)}</option>`).join('')}</select></label>
       <div class="grid2">
         <label class="field"><span>${esc(t('Distancia (m)'))}</span><input id="dbDist" type="text" inputmode="decimal" autocomplete="off" placeholder="25"></label>
         <label class="field"><span>${esc(t('Azimut (0–360°)'))}</span><input id="dbAz" type="text" inputmode="decimal" autocomplete="off" placeholder="90"></label>
       </div>
       <label class="field"><span>${esc(t('Norte de referencia'))}</span><select id="dbNorth"><option value="true">${esc(t('Verdadero (el del mapa)'))}</option><option value="mag">${esc(t('Magnético (el de la brújula)'))}</option></select></label>
       <label class="field" id="dbDeclF" hidden><span>${esc(t('Declinación magnética (°, positiva al este)'))}</span><input id="dbDecl" type="text" inputmode="decimal" autocomplete="off" value="${esc(decl0)}" placeholder="0"></label>
       <p class="muted small">${esc(t('Azimut desde el norte, en el sentido del reloj: 0° = norte, 90° = este, 180° = sur, 270° = oeste. La distancia es horizontal, sobre el terreno.'))}</p>`,
      [
        {label: t('Cancelar'), value: null},
        {label: t('Agregar'), primary: true, value: (w) => ({from: w.querySelector('#dbFrom').value, d: w.querySelector('#dbDist').value, az: w.querySelector('#dbAz').value, north: w.querySelector('#dbNorth').value, decl: w.querySelector('#dbDecl').value})},
      ],
      (w) => {
        const n = w.querySelector('#dbNorth');
        n.onchange = () => (w.querySelector('#dbDeclF').hidden = n.value !== 'mag');
      },
    );
    if (!res || !this.active) return;
    try {
      const d = parseNumber(res.d, t('Distancia'));
      if (!(d > 0)) throw new Error(t('La distancia debe ser mayor que 0.'));
      let az = parseNumber(res.az, t('Azimut'));
      if (az < 0 || az > 360) throw new Error(t('El azimut va de 0° a 360°.'));
      if (res.north === 'mag') {
        const decl = res.decl.trim() === '' ? 0 : parseNumber(res.decl, t('Declinación'));
        if (Math.abs(decl) > 90) throw new Error(t('La declinación va de −90° a 90°.'));
        az += decl; // azimut magnético + declinación (este +) = azimut verdadero
      }
      az = ((az % 360) + 360) % 360;
      let origin;
      if (res.from === 'gps') {
        const fx = this.gpsFixOrWarn(); // la posición de ahora, no la de antes de escribir
        if (!fx) return;
        origin = [fx.lon, fx.lat];
      } else origin = res.from === 'sel' && sel ? toLL(sel.getGeometry().getCoordinates()) : toLL(this.map.getView().getCenter());
      const ll = pointAtDistanceBearing(origin, d, az);
      this.addPointLL(ll, {fuente: 'bearing', dist_m: round(d, 3), az_deg: round(az, 2)});
    } catch (e) {
      toast(e.message, 5000);
    }
  }

  async renumber() {
    const pts = this.ordered().filter((f) => typeOf(f) === 'Point');
    if (!pts.length) return toast(t('Esta capa no tiene puntos.'));
    const key = this.nameKey();
    const sample = nextName(pts.map((f) => f.get(key)));
    const prefix = (/^(.*?)\d+$/.exec(sample) || [null, 'P'])[1];
    const preview = (p, s) => {
      const st = Math.floor(parseLocaleNumber(s));
      if (!Number.isFinite(st) || st < 0) return t('Escriba un número entero (0 o más).');
      const names = renumberNames(pts.length, p, st, 3);
      return tn(pts.length, 'Quedará {first}. Se reemplaza el nombre de {n} punto.', 'Quedarán {first} … {last}. Se reemplazan los nombres de los {n} puntos.', {first: names[0], last: names[names.length - 1]});
    };
    const res = await dialog(
      t('Renumerar puntos'),
      `<p class="muted small">${esc(t('Pone nombres seguidos a los puntos, en el orden de la capa (en un plan, el orden del recorrido). Útil después de borrar o agregar puntos.'))}</p>
       <div class="grid2">
         <label class="field"><span>${esc(t('Prefijo'))}</span><input id="rnP" type="text" maxlength="12" autocomplete="off" value="${esc(prefix)}"></label>
         <label class="field"><span>${esc(t('Empezar en'))}</span><input id="rnS" type="text" inputmode="numeric" autocomplete="off" value="1"></label>
       </div>
       <p class="note warn" id="rnPrev">${esc(preview(prefix, '1'))}</p>`,
      [{label: t('Cancelar'), value: null}, {label: t('Renumerar'), primary: true, value: (w) => ({p: w.querySelector('#rnP').value, s: w.querySelector('#rnS').value})}],
      (w) => {
        const upd = () => (w.querySelector('#rnPrev').textContent = preview(w.querySelector('#rnP').value, w.querySelector('#rnS').value));
        w.querySelector('#rnP').oninput = upd;
        w.querySelector('#rnS').oninput = upd;
      },
    );
    if (!res || !this.active) return;
    const start = Math.floor(parseLocaleNumber(res.s));
    if (!Number.isFinite(start) || start < 0) return toast(t('«Empezar en» debe ser un número entero (0 o más). No se cambió nada.'), 4000);
    const names = renumberNames(pts.length, res.p, start, 3);
    const useIds = pts.every((f) => f.get('id') !== undefined);
    this.pushHistory(t('Renumerar puntos'));
    pts.forEach((f, i) => {
      this.setName(f, names[i]);
      if (useIds) f.set('id', start + i);
    });
    this.changed();
    this.flashSnack(t('Puntos renombrados: {first} … {last}.', {first: names[0], last: names[names.length - 1]}), true);
  }

  // ---------------------------------------------------------------- atributos
  fields() {
    return fieldsOf(this.source.getFeatures().map((f) => f.getProperties()));
  }

  numericFields() {
    const out = new Set();
    for (const k of this.fields()) {
      const vals = this.source.getFeatures().map((f) => f.get(k)).filter((v) => v !== null && v !== undefined && v !== '');
      if (vals.length && vals.every((v) => typeof v === 'number')) out.add(k);
    }
    return out;
  }

  llCoords(f) {
    const g = f.getGeometry();
    const ty = g.getType();
    if (ty === 'LineString') return g.getCoordinates().map(toLL);
    if (ty === 'Polygon') return g.getCoordinates()[0].slice(0, -1).map(toLL);
    if (ty === 'MultiLineString') return g.getCoordinates().flat().map(toLL);
    if (ty === 'MultiPolygon') return g.getCoordinates()[0][0].slice(0, -1).map(toLL);
    return [toLL(g.getCoordinates())];
  }

  /** Campo del formulario: interruptor para sí/no, teclado numérico para números, texto largo en varias líneas. */
  fieldHtml(k, v, isNum) {
    const lbl = fieldLabelHtml(k);
    if (typeof v === 'boolean') return `<label class="switch"><input type="checkbox" data-f="${esc(k)}" data-bool="1" ${v ? 'checked' : ''}><span>${lbl}</span></label>`;
    const s = v === null || v === undefined ? '' : String(v);
    if (/[\r\n]/.test(s) || s.length > 80) return `<label class="field"><span>${lbl}</span><textarea data-f="${esc(k)}" rows="3">${esc(s)}</textarea></label>`;
    const num = isNum || typeof v === 'number';
    return `<label class="field"><span>${lbl}</span><input type="text" ${num ? 'inputmode="decimal" data-num="1"' : ''} data-f="${esc(k)}" value="${esc(s)}" autocomplete="off"><small class="eb-err" hidden></small></label>`;
  }

  /** Hoja de un elemento elegido (o de varios): medidas, datos, datos de la toma y acciones. */
  featurePanel() {
    const sel = this.selected.getArray();
    if (!sel.length) return closeSheet();
    if (sel.length > 1) return this.multiPanel();
    const f = sel[0];
    const g = f.getGeometry();
    const gt = g.getType();
    const key = this.nameKey();
    let info = '';
    if (gt === 'Point') info = this.ctx.coordsHtml(toLL(g.getCoordinates()), f.get('z'));
    else if (/Line/.test(gt)) {
      const ll = this.llCoords(f);
      info = kvTable([[t('Largo'), fmtDist(lengthLL(ll))], [t('Puntos'), fmtNum(ll.length)]]);
    } else if (/Polygon/.test(gt)) {
      const ll = this.llCoords(f);
      info = kvTable([[t('Área'), fmtArea(areaLL(ll))], [t('Perímetro'), fmtDist(lengthLL([...ll, ll[0]]))], [t('Esquinas'), fmtNum(ll.length)]]);
    }
    const fields = this.fields();
    if (!fields.includes(key)) fields.unshift(key);
    const capture = fields.filter((k) => isCaptureValue(k, f.get(k)));
    const nums = this.numericFields();
    const form = fields.filter((k) => !capture.includes(k)).map((k) => this.fieldHtml(k, f.get(k), nums.has(k))).join('');
    const shownCapture = capture.filter((k) => f.get(k) !== undefined && f.get(k) !== null);
    const captureHtml = shownCapture.length ? `<h4>${esc(t('Datos de la toma'))}</h4>${kvTable(shownCapture.map((k) => [fieldLabel(k), fmtCapture(k, f.get(k))]))}` : '';
    const act = (a, ic, label, cls = '') => `<button type="button" class="btn ${cls}" data-a="${a}">${eicon(ic)}${esc(label)}</button>`;
    let actions = act('save', 'check', t('Guardar'), 'primary');
    if (gt === 'Point') actions += act('move', 'move', t('Mover')) + act('gps', 'locate', t('Mover a mi posición GPS')) + act('coords', 'crosshair', t('Escribir coordenadas…'));
    else actions += act('vertex', 'vertex', t('Editar forma')) + act('move', 'move', t('Mover'));
    if (gt === 'LineString') actions += act('split', 'cut', t('Cortar la línea…')) + act('reverse', 'swap', t('Invertir dirección'));
    else if (gt === 'MultiLineString') actions += act('reverse', 'swap', t('Invertir dirección'));
    actions += act('dup', 'plus', t('Duplicar')) + act('field', 'plus', t('Agregar campo')) + act('del', 'trash', t('Borrar'), 'danger');
    // Lo escrito se guarda también al cerrar la ficha (atrás, la X o tocar otro elemento)
    const body = openSheet(this.label(f), `${info}<h4>${esc(t('Datos'))}</h4>${form}<p class="muted small">${esc(t('Lo que escriba se guarda también al cerrar esta ficha.'))}</p>${captureHtml}<div class="row-actions col">${actions}</div>`, {
      onClose: () => {
        if (this.active && this.source && this.source.hasFeature(f)) this.saveForm(body, [f]);
      },
    });
    body.querySelectorAll('[data-f]').forEach((inp) => (inp.dataset.v0 = inp.value));
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (!this.active || !this.source || !this.source.hasFeature(f)) return closeSheet(); // ficha de una edición ya cerrada
      if (a === 'save') {
        if (this.saveForm(body, [f])) toast(t('Datos guardados.'), 1500);
        return;
      }
      if (a === 'field') {
        this.saveForm(body, [f]);
        const k = await this.addField();
        if (k && this.active && this.source.hasFeature(f)) this.featurePanel();
        return;
      }
      this.saveForm(body, [f]);
      if (a === 'move' || a === 'vertex' || a === 'split') {
        closeSheet();
        return this.setTool(a);
      }
      if (a === 'gps') {
        closeSheet();
        return this.moveSelectedToGps();
      }
      if (a === 'coords') return this.exactCoords();
      if (a === 'reverse') {
        closeSheet();
        return this.reverseSelected();
      }
      if (a === 'dup') {
        closeSheet();
        return this.duplicateSelected();
      }
      if (a === 'del') return this.deleteSelected();
    });
  }

  /**
   * Guarda lo escrito en el formulario (solo lo que cambió). Un texto en un campo numérico no
   * se guarda: el campo se marca y se avisa. Devuelve false si quedó algo sin guardar.
   */
  saveForm(body, feats) {
    const inputs = [...body.querySelectorAll('[data-f]')];
    if (!inputs.length) return true;
    const nums = this.numericFields();
    const key = this.nameKey();
    const changes = [];
    const bad = new Set();
    for (const f of feats) {
      for (const inp of inputs) {
        const k = inp.dataset.f;
        const old = f.get(k);
        if (inp.dataset.bool) {
          if (inp.checked !== old) changes.push([f, k, inp.checked]);
          continue;
        }
        // Solo lo que el usuario cambió en esta ficha: así no se reescriben valores que el programa
        // acaba de poner (GPS, coordenadas) ni cambia el tipo o los saltos de línea de lo no tocado.
        const shown = inp.dataset.v0 !== undefined ? inp.dataset.v0 : old === null || old === undefined ? '' : String(old);
        if (inp.value === shown) continue;
        const numeric = !!inp.dataset.num || nums.has(k) || typeof old === 'number';
        if (numeric && !isNumberText(inp.value)) {
          bad.add(inp);
          continue;
        }
        const v = typeof old === 'boolean' ? toBool(inp.value) : coerceValue(inp.value, numeric);
        if ((old ?? null) !== v && !(old === undefined && v === null)) changes.push([f, k, v]);
      }
    }
    for (const inp of inputs) {
      const err = inp.parentElement && inp.parentElement.querySelector('.eb-err');
      const isBad = bad.has(inp);
      if (isBad) inp.setAttribute('aria-invalid', 'true');
      else inp.removeAttribute('aria-invalid');
      if (err) {
        err.hidden = !isBad;
        err.textContent = isBad ? t('Este campo es numérico: escriba un número, por ejemplo {ex}.', {ex: fmtNum(12.5, 1)}) : '';
      }
    }
    if (bad.size) toast(tn(bad.size, 'Un campo no se guardó: escriba un número.', '{n} campos no se guardaron: escriba números.'), 4000);
    if (changes.length) {
      this.pushHistory(feats.length === 1 ? t('Cambiar datos de {name}', {name: this.label(feats[0])}) : tn(feats.length, 'Cambiar datos de {n} elemento', 'Cambiar datos de {n} elementos'));
      for (const [f, k, v] of changes) {
        if (k === key) this.setName(f, v);
        else f.set(k, v);
      }
      inputs.forEach((inp) => !bad.has(inp) && (inp.dataset.v0 = inp.value)); // ya guardado
      this.changed();
    }
    return !bad.size;
  }

  multiPanel() {
    const sel = this.selected.getArray();
    const n = sel.length;
    const fields = this.fields();
    const body = openSheet(
      tn(n, '{n} elemento elegido', '{n} elementos elegidos'),
      `<p class="muted small">${esc(this.opt.multi ? t('Toque más elementos en el mapa para sumarlos o quitarlos de la selección.') : t('Puede moverlos, duplicarlos, borrarlos o darles a todos el mismo valor.'))}</p>
       ${fields.length ? `<h4>${esc(t('Dar el mismo valor a todos'))}</h4>
       <div class="grid2"><label class="field"><span>${esc(t('Campo'))}</span><select id="mfK">${fields.map((k) => `<option value="${esc(k)}">${esc(fieldLabel(k))}</option>`).join('')}</select></label>
       <label class="field"><span>${esc(t('Valor'))}</span><input id="mfV" type="text" autocomplete="off"></label></div>
       <div class="row-actions"><button type="button" class="btn tonal" data-a="setall">${esc(t('Asignar a todos'))}</button></div>` : ''}
       <div class="row-actions col">
         <button type="button" class="btn" data-a="move">${icon('move')}${esc(t('Mover juntos'))}</button>
         <button type="button" class="btn" data-a="dup">${icon('plus')}${esc(t('Duplicar'))}</button>
         <button type="button" class="btn" data-a="none">${icon('close')}${esc(t('Deseleccionar'))}</button>
         <button type="button" class="btn danger" data-a="del">${icon('trash')}${esc(tn(n, 'Borrar {n}', 'Borrar los {n}'))}</button>
       </div>`,
    );
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (!this.active || !this.source || sel.some((f) => !this.source.hasFeature(f))) return closeSheet();
      if (a === 'setall') {
        const k = $('#mfK').value;
        const txt = $('#mfV').value;
        const numeric = this.numericFields().has(k);
        if (numeric && !isNumberText(txt)) return toast(t('«{field}» es numérico: escriba un número, por ejemplo {ex}.', {field: fieldLabel(k), ex: fmtNum(12.5, 1)}), 4000);
        const bool = sel.some((f) => typeof f.get(k) === 'boolean');
        const v = bool ? toBool(txt) : coerceValue(txt, numeric);
        this.pushHistory(tn(n, 'Asignar «{field}» a {n} elemento', 'Asignar «{field}» a {n} elementos', {field: fieldLabel(k)}));
        sel.forEach((f) => (k === this.nameKey() ? this.setName(f, v) : f.set(k, v)));
        this.changed();
        closeSheet();
        return this.flashSnack(tn(n, '«{field}» asignado a {n} elemento.', '«{field}» asignado a {n} elementos.', {field: fieldLabel(k)}), true);
      }
      if (a === 'move') {
        closeSheet();
        return this.setTool('move');
      }
      if (a === 'dup') {
        closeSheet();
        return this.duplicateSelected();
      }
      if (a === 'none') return this.clearSelection();
      if (a === 'del') return this.deleteSelected();
    });
  }

  /**
   * Pide el nombre de un campo nuevo y lo agrega a todos los elementos de la capa.
   * Muestra el nombre final si hubo que limpiarlo. Devuelve la clave o null.
   */
  async addField() {
    const typed = await promptDialog(t('Agregar campo'), t('Nombre del campo (por ejemplo: profundidad_cm)'));
    if (!typed || !this.active) return null;
    let k;
    try {
      k = cleanFieldName(typed);
    } catch (err) {
      toast(err.message, 4000);
      return null;
    }
    if (k !== typed.trim()) {
      const ok = await confirmDialog(t('Nombre del campo'), t('El campo se llamará «{field}» (sin espacios ni signos). ¿Agregarlo?', {field: k}), t('Agregar'));
      if (!ok || !this.active) return null;
    }
    if (this.fields().includes(k)) {
      toast(t('La capa ya tiene el campo «{field}».', {field: k}), 3000);
      return k;
    }
    this.pushHistory(t('Agregar el campo {field}', {field: k}));
    this.source.getFeatures().forEach((f) => f.get(k) === undefined && f.set(k, null));
    this.changed();
    toast(t('Campo agregado: {field}', {field: k}), 2000);
    return k;
  }

  /** Campos de la capa: agregar o quitar uno en todos los elementos. */
  fieldsPanel() {
    const fields = this.fields();
    const body = openSheet(
      t('Campos de la capa'),
      `<p class="muted small">${esc(t('Los campos son los datos que anota de cada elemento, por ejemplo «especie» o «profundidad».'))}</p>
       ${fields.length ? `<div class="list">${fields.map((k) => `<div class="list-row static"><span class="eb-grow"><b>${esc(fieldLabel(k))}</b>${KEY_LABELS[k] ? `<small class="mono">${esc(k)}</small>` : ''}</span><button type="button" class="icon-btn" data-del="${esc(k)}" aria-label="${esc(t('Quitar el campo {field}', {field: k}))}">${icon('trash')}</button></div>`).join('')}</div>` : `<p class="muted">${esc(t('Esta capa todavía no tiene campos.'))}</p>`}
       <div class="row-actions"><button type="button" class="btn tonal" data-a="add">${icon('plus')}${esc(t('Agregar campo'))}</button></div>`,
    );
    body.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        const k = del.dataset.del;
        const ok = await confirmDialog(t('Quitar campo'), t('¿Quitar el campo «{field}» de todos los elementos? Puede deshacerlo con «Deshacer».', {field: k}), t('Quitar'), true);
        if (!ok || !this.active) return;
        this.pushHistory(t('Quitar el campo {field}', {field: k}));
        this.source.getFeatures().forEach((f) => f.unset(k));
        this.changed();
        this.flashSnack(t('Campo quitado: {field}. «Deshacer» lo recupera.', {field: k}), true);
        return this.fieldsPanel();
      }
      if (e.target.closest('[data-a="add"]')) {
        const k = await this.addField();
        if (k && this.active) this.fieldsPanel();
      }
    });
  }

  // ---------------------------------------------------------------- «Más»
  morePanel() {
    const o = this.opt;
    const sw = (k, label, help) => `<label class="switch"><input type="checkbox" data-o="${k}" ${o[k] ? 'checked' : ''}><span>${esc(label)}${help ? `<small>${esc(help)}</small>` : ''}</span></label>`;
    const num = (k, label, min, max) => `<label class="field"><span>${esc(label)}</span><input type="text" inputmode="decimal" autocomplete="off" data-n="${k}" data-min="${min}" data-max="${max}" value="${esc(fmtNum(o[k], Number.isInteger(Number(o[k])) ? 0 : 1))}"><small class="eb-err" hidden></small></label>`;
    const btn = (a, ic, label, cls = '') => `<button type="button" class="btn ${cls}" data-a="${a}">${eicon(ic)}${esc(label)}</button>`;
    const pt = this.allowed('Point');
    const nSel = this.selected.getLength();
    const tol = Number(o.snapTol) || 16;
    const level = SNAP_LEVELS.reduce((best, l) => (Math.abs(l[2] - tol) < Math.abs(best[2] - tol) ? l : best))[0]; // i18n-ok
    const others = !this.entry.rec.geomType && this.layerType !== 'any';
    const redo = this.future.length ? this.future[this.future.length - 1].what : null;
    const body = openSheet(
      t('Más opciones'),
      `${redo !== null ? `<div class="row-actions col">${btn('redo', 'redo', redo ? t('Rehacer: {what}', {what: redo}) : t('Rehacer'))}</div>` : ''}
       ${pt ? `<h4>${esc(t('Agregar un punto'))}</h4>
       <div class="row-actions col">
         ${btn('gps', 'locate', t('Punto en mi posición GPS'))}
         ${btn('avg', 'avg', t('Punto GPS preciso (promedio de {s} s)', {s: fmtNum(o.avgSec)}))}
         ${btn('coords', 'crosshair', t('Escribir coordenadas…'))}
         ${btn('bearing', 'compass', t('Punto a distancia y azimut…'))}
       </div>` : ''}
       ${others ? `<div class="row-actions col">${btn('alltypes', 'layers', t('Dibujar también otros tipos (puntos, líneas o áreas)'))}</div>` : ''}
       <h4>${esc(t('Selección'))}</h4>
       ${sw('multi', t('Elegir varios'), t('Cada toque suma o quita un elemento de la selección.'))}
       ${nSel ? `<div class="row-actions col">${btn('dup', 'plus', t('Duplicar lo elegido'))}${btn('none', 'close', t('Deseleccionar'))}</div>` : ''}
       <h4>${esc(t('Esta capa'))}</h4>
       <div class="row-actions col">
         ${pt ? btn('renumber', 'sync', t('Renumerar puntos…')) : ''}
         ${btn('fields', 'data', t('Campos de la capa…'))}
         ${btn('export', 'share', t('Exportar esta capa…'))}
       </div>
       <h4>${esc(t('Opciones'))}</h4>
       ${sw('snap', t('Imán'), t('Lo que dibuja o arrastra se pega a las esquinas y bordes cercanos de las capas visibles.'))}
       <div class="field"><span>${esc(t('Fuerza del imán'))}</span><div class="seg" role="group" aria-label="${esc(t('Fuerza del imán'))}">${SNAP_LEVELS.map(([v, lbl]) => `<button type="button" data-snap="${v}" class="${v === level ? 'on' : ''}" aria-pressed="${v === level}">${esc(t(lbl))}</button>`).join('') /* i18n-dynamic */}</div></div>
       ${num('avgSec', t('GPS preciso: segundos de promedio'), 2, 300)}
       ${num('streamM', t('Dibujar caminando: un punto cada (m)'), 0.5, 100)}
       ${num('warnAcc', t('Avisar si la precisión GPS es peor que (m)'), 1, 200)}
       ${sw('formOnAdd', t('Abrir los datos al agregar cada elemento'))}`,
    );
    body.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.o) {
        o[el.dataset.o] = el.checked;
        saveSettings();
        if (el.dataset.o === 'snap') this.setTool(this.tool);
        if (el.dataset.o === 'multi' && !el.checked && this.selected.getLength() > 1) {
          const first = this.selected.item(0);
          this.selected.clear();
          this.selected.push(first);
        }
        this.render();
      } else if (el.dataset.n) {
        const v = parseLocaleNumber(el.value);
        const min = Number(el.dataset.min), max = Number(el.dataset.max);
        const ok = Number.isFinite(v) && v >= min && v <= max; // i18n-ok
        const err = el.parentElement.querySelector('.eb-err');
        if (ok) el.removeAttribute('aria-invalid');
        else el.setAttribute('aria-invalid', 'true');
        err.hidden = ok;
        err.textContent = ok ? '' : t('Escriba un número entre {min} y {max}. No se cambió.', {min: fmtNum(min, min % 1 ? 1 : 0), max: fmtNum(max, 0)});
        if (!ok) return;
        o[el.dataset.n] = v;
        saveSettings();
      }
    });
    body.addEventListener('click', async (e) => {
      const s = e.target.closest('[data-snap]');
      if (s) {
        const lv = SNAP_LEVELS.find((l) => l[0] === s.dataset.snap);
        o.snapTol = lv[2];
        saveSettings();
        body.querySelectorAll('[data-snap]').forEach((b) => {
          b.classList.toggle('on', b === s);
          b.setAttribute('aria-pressed', String(b === s));
        });
        return this.setTool(this.tool);
      }
      const b = e.target.closest('[data-a]');
      if (!b || !this.active) return;
      const a = b.dataset.a;
      if (a === 'fields') return this.fieldsPanel();
      closeSheet();
      if (a === 'redo') return this.redo();
      if (a === 'gps') return this.addGpsPoint();
      if (a === 'avg') return this.startAveraging();
      if (a === 'coords') return this.pointByCoords();
      if (a === 'bearing') return this.pointByBearing();
      if (a === 'renumber') return this.renumber();
      if (a === 'export') return this.exportLayer();
      if (a === 'dup') return this.duplicateSelected();
      if (a === 'none') return this.clearSelection();
      if (a === 'alltypes') {
        this.layerType = 'any';
        return this.render();
      }
    });
  }

  // ---------------------------------------------------------------- exportar
  async exportLayer() {
    const fs = this.ordered();
    if (!fs.length) return toast(t('La capa está vacía: no hay nada que exportar.'));
    const pts = fs.filter((f) => typeOf(f) === 'Point');
    const ext = this.source.getExtent();
    const mid = isEmpty(ext) ? toLL(this.map.getView().getCenter()) : toLL(getCenter(ext));
    const cr = inCostaRica(mid[0], mid[1]); // los sistemas de Costa Rica, solo si los datos están allí
    const opt = (v, label) => `<option value="${v}">${esc(label)}</option>`;
    const fmt = await dialog(
      t('Exportar la capa'),
      `<label class="field"><span>${esc(t('Formato'))}</span><select id="exF">
        ${opt('geojson', t('GeoJSON: todos los elementos y sus datos (WGS 84)'))}
        ${opt('kml', t('KML: para Google Earth'))}
        ${opt('gpx', t('GPX: puntos y líneas, para GPS y apps de navegación'))}
        ${pts.length ? opt('csv', cr ? t('CSV de puntos: latitud/longitud, UTM y CRTM05') : t('CSV de puntos: latitud/longitud y UTM')) : ''}
        ${pts.length && cr ? opt('sp8908', 'CSV SingularPad · CRTM05 CR-SIRGAS (EPSG:8908)') + opt('sp5367', 'CSV SingularPad · CRTM05 CR05 (EPSG:5367)') : ''}
        ${pts.length ? opt('sputm', 'CSV SingularPad · UTM WGS 84') : ''}
      </select></label>
      ${pts.length ? '' : `<p class="note info">${esc(t('CSV y SingularPad exportan solo puntos, y esta capa no tiene.'))}</p>`}
      <p class="muted small">${esc(t('Después elija dónde guardar el archivo.'))}</p>`,
      [{label: t('Cancelar'), value: null}, {label: t('Exportar'), primary: true, value: (w) => w.querySelector('#exF').value}],
    );
    if (!fmt || !this.active) return;
    const base = safeFileName(this.entry.rec.name, 'layer');
    const opts = {dataProjection: 'EPSG:4326', featureProjection: VIEW_PROJ, decimals: 9};
    const key = this.nameKey();
    if (fmt === 'geojson') return this.ctx.saveText(`${base}.geojson`, 'application/geo+json', geojson.writeFeatures(fs, opts));
    if (fmt === 'kml') {
      const copies = fs.map((f) => {
        const c = f.clone();
        if (c.get('name') === undefined && c.get(key) !== undefined) c.set('name', String(c.get(key)));
        return c;
      });
      return this.ctx.saveText(`${base}.kml`, 'application/vnd.google-earth.kml+xml', new KML({writeStyles: false}).writeFeatures(copies, opts));
    }
    if (fmt === 'gpx') {
      const ok = fs.filter((f) => ['Point', 'LineString', 'MultiLineString'].includes(typeOf(f))).map((f) => {
        const c = f.clone();
        c.setProperties({name: String(f.get(key) ?? '')});
        // «time» en texto (como lo escribe el GeoJSON de la app) o «ele» que no es número darían un GPX inválido
        for (const [k, v] of Object.entries(gpxTypedProps(c.getProperties()))) {
          if (v === undefined) c.unset(k, true);
          else c.set(k, v, true);
        }
        // En una ruta, OpenLayers copiaría la hora y la altura de la línea a cada uno de sus puntos
        if (typeOf(f) === 'LineString') {
          c.unset('time', true);
          c.unset('ele', true);
        }
        return c;
      });
      if (ok.length < fs.length) toast(t('GPX no admite áreas: se exportan solo los puntos y las líneas.'), 4000);
      return this.ctx.saveText(`${base}.gpx`, 'application/gpx+xml', new GPX().writeFeatures(ok, opts));
    }
    // Contenido de los archivos: igual en todos los idiomas (claves fijas y punto decimal)
    const rows = pts.map((f) => ({name: String(f.get(key) ?? ''), ll: toLL(f.getGeometry().getCoordinates()), f}));
    if (fmt === 'csv') {
      const utm = this.ctx.utmCode(rows[0].ll);
      const extra = this.fields().filter((k) => k !== key);
      const head = ['nombre', 'lat_WGS84', 'lon_WGS84', `E_${utm.replace(':', '')}`, `N_${utm.replace(':', '')}`, ...(cr ? ['E_CRTM05_EPSG8908', 'N_CRTM05_EPSG8908'] : []), ...extra];
      // Texto que empiece con = + - @ (y no sea un número) se antepone con ' para que Excel no lo ejecute como fórmula
      const q = (v) => {
        if (v === null || v === undefined) return '';
        let s = String(v);
        if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+([.,]\d+)?([eE][+-]?\d+)?$/.test(s.trim())) s = "'" + s;
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [head.map(q).join(',')];
      for (const r of rows) {
        const u = fromWgs84(utm, r.ll);
        const c = cr ? fromWgs84('EPSG:8908', r.ll) : null;
        lines.push([r.name, r.ll[1].toFixed(8), r.ll[0].toFixed(8), u[0].toFixed(3), u[1].toFixed(3), ...(c ? [c[0].toFixed(3), c[1].toFixed(3)] : []), ...extra.map((k) => r.f.get(k))].map(q).join(','));
      }
      return this.ctx.saveText(`${base}.csv`, 'text/csv', '﻿' + lines.join('\r\n'));
    }
    const code = fmt === 'sp8908' ? 'EPSG:8908' : fmt === 'sp5367' ? 'EPSG:5367' : this.ctx.utmCode(rows[0].ll);
    const text = rows.map((r) => {
      const [e, n] = fromWgs84(code, r.ll);
      const z = r.f.get('h_elipsoidal_m') ?? r.f.get('z');
      const cod = r.f.get('codigo') ?? r.f.get('code') ?? r.f.get('linea') ?? '';
      const clean = (s) => String(s).replace(/[,\r\n]+/g, ' ');
      return `${clean(r.name)},${n.toFixed(3)},${e.toFixed(3)},${z !== null && z !== undefined && Number.isFinite(Number(z)) ? Number(z).toFixed(3) : '0.000'},${clean(cod)}`;
    }).join('\n') + '\n';
    return this.ctx.saveText(`${base}_SingularPad_${code.replace(':', '')}.csv`, 'text/csv', text);
  }

  // ---------------------------------------------------------------- barra de herramientas
  onBarClick(e) {
    const b = e.target.closest('[data-t]');
    if (!b || !this.active) return;
    const id = b.dataset.t;
    if (b.getAttribute('aria-disabled') === 'true') return toast(b.dataset.why || t('No hay nada que deshacer.'), 3500); // explica por qué no se puede
    if (id === 'select') {
      closeSheet();
      return this.setTool('select');
    }
    if (id === 'point' || id === 'line' || id === 'polygon' || id === 'move' || id === 'vertex' || id === 'split') {
      closeSheet();
      return this.setTool(this.tool === id && id !== 'split' ? 'select' : id); // tocar la herramienta activa la apaga
    }
    if (id === 'undo') return this.undo();
    if (id === 'more') return this.morePanel();
    if (id === 'done') return this.finish();
    if (id === 'delete') return this.deleteSelected();
    if (id === 'data') return this.featurePanel();
    if (id === 'none') return this.clearSelection();
    if (id === 'togps') return this.moveSelectedToGps();
    if (id === 'gpspt') return this.addGpsPoint();
    if (id === 'avg') return this.startAveraging();
    if (id === 'avgsave') return this.finishAveraging(true);
    if (id === 'avgcancel') return this.cancelAveraging(false);
    if (id === 'walk') return this.toggleWalk();
    if (id === 'gpsv') return this.gpsVertex();
    if (id === 'cancel') return this.confirmAbort();
    if (id === 'finish') {
      if (this.draw && this.drawing && this.sketchOk()) this.draw.finishDrawing();
      return;
    }
    if (id === 'delv') {
      this.deleteVertex = !this.deleteVertex;
      return this.render();
    }
  }

  /** Herramientas de la fila de abajo según el momento (2 a 4; nunca hace falta desplazarse). */
  tools() {
    const tl = this.tool;
    const sel = this.selected.getArray();
    const nSel = sel.length;
    const B = (id, ic, label, o = {}) => ({id, ic, label, ...o});
    if (this.avg) {
      return [
        B('avgsave', 'flag', t('Guardar ya'), {cls: 'go', wait: !this.avg.fixes.length, why: t('Todavía no llegó ninguna lectura GPS.')}),
        B('avgcancel', 'close', t('Cancelar'), {cls: 'danger'}),
      ];
    }
    if ((tl === 'line' || tl === 'polygon') && (this.drawing || this.streaming)) {
      const line = tl === 'line';
      return [
        B('finish', 'flag', line ? t('Terminar línea') : t('Terminar área'), {cls: 'go', wait: !this.sketchOk(), why: line ? t('Una línea necesita al menos 2 puntos.') : t('Un área necesita al menos 3 esquinas.')}),
        B('gpsv', 'locate', t('Punto GPS')),
        this.streaming ? B('walk', 'pause', t('Pausar'), {on: true}) : B('walk', 'walk', t('Dibujar caminando'), {on: false}),
        B('cancel', 'trash', t('Descartar'), {cls: 'danger'}),
      ];
    }
    if (tl === 'split') return [B('split', 'cut', t('Cortar'), {on: true}), B('select', 'close', t('Cancelar'))];
    if (nSel) {
      if (nSel > 1) {
        return [B('move', 'move', t('Mover'), {on: tl === 'move'}), B('data', 'data', t('Datos')), B('delete', 'trash', t('Borrar ({n})', {n: fmtNum(nSel)}), {cls: 'danger'}), B('none', 'close', t('Deseleccionar'))];
      }
      if (isPoint(sel[0])) return [B('move', 'move', t('Mover'), {on: tl === 'move'}), B('togps', 'locate', t('A mi posición')), B('data', 'data', t('Datos')), B('delete', 'trash', t('Borrar'), {cls: 'danger'})];
      if (tl === 'vertex') return [B('vertex', 'vertex', t('Editar forma'), {on: true}), B('delv', 'vminus', t('Quitar esquina'), {on: this.deleteVertex}), B('move', 'move', t('Mover'), {on: false}), B('data', 'data', t('Datos'))];
      return [B('vertex', 'vertex', t('Editar forma'), {on: false}), B('move', 'move', t('Mover'), {on: tl === 'move'}), B('data', 'data', t('Datos')), B('delete', 'trash', t('Borrar'), {cls: 'danger'})];
    }
    const sel0 = B('select', 'select', t('Seleccionar'), {on: tl === 'select'});
    const point = B('point', 'pin', t('Punto'), {on: tl === 'point'});
    const line = B('line', 'line', t('Línea'), {on: tl === 'line'});
    const area = B('polygon', 'poly', t('Área'), {on: tl === 'polygon'});
    const gpsPt = B('gpspt', 'locate', t('En mi posición'));
    const avg = B('avg', 'avg', t('GPS preciso'));
    const walk = B('walk', 'walk', t('Dibujar caminando'), {on: false});
    if (tl === 'point') return [sel0, point, gpsPt, avg];
    if (tl === 'line') return [sel0, line, B('gpsv', 'locate', t('Punto GPS')), walk];
    if (tl === 'polygon') return [sel0, area, B('gpsv', 'locate', t('Punto GPS')), walk];
    const types = this.shownTypes();
    if (types.length === 1) {
      if (types[0] === 'Point') return [sel0, point, gpsPt, avg];
      return [sel0, types[0] === 'LineString' ? line : area, walk];
    }
    return [sel0, point, line, area];
  }

  btnHtml(b) {
    const pressed = b.on === undefined ? '' : ` aria-pressed="${b.on ? 'true' : 'false'}"`;
    const wait = b.wait ? ` aria-disabled="true" data-why="${esc(b.why || '')}"` : '';
    return `<button type="button" class="eb-btn ${b.cls || ''} ${b.on ? 'on' : ''}" data-t="${b.id}"${pressed}${wait}>${eicon(b.ic)}<span class="eb-lbl">${esc(softWrap(b.label))}</span></button>`;
  }

  statusHtml() {
    const n = this.source ? this.source.getFeatures().length : 0;
    const st = this.saveState;
    const save = st === 'error'
      ? `<span class="eb-save bad">${eicon('alert')}${esc(t('Sin guardar: reintentando'))}</span>`
      : st === 'saved'
        ? `<span class="eb-save">${icon('check')}${esc(t('Guardado'))}</span>`
        : `<span class="eb-save">${icon('sync')}${esc(t('Guardando…'))}</span>`;
    return `${save} · ${esc(tn(n, '{n} elemento', '{n} elementos'))}`;
  }

  /**
   * Dibuja la barra. Cada parte se reemplaza solo si cambió, para que un toque que está
   * ocurriendo sobre un botón no se pierda porque el botón se volvió a crear.
   */
  render() {
    if (!this.active) return;
    if (!this.bar.querySelector('.eb-top')) {
      this.bar.innerHTML = '<div class="eb-top"></div><div class="eb-hint" id="ebHint" aria-live="polite"></div><div class="eb-tools"></div>';
    }
    const canUndo = this.drawing ? this.sketchVertices() > 0 : this.history.length > 0;
    const busy = !!(this.drawing || this.streaming || this.avg);
    const undo = {id: 'undo', ic: 'undo', label: t('Deshacer'), cls: `eb-pin ${this.snack && this.snack.undoable ? 'pulse' : ''}`, wait: !canUndo, why: this.drawing ? t('Todavía no hay puntos que quitar.') : t('No hay nada que deshacer.')};
    // «Más» y «Listo» van juntos: si al nombre le falta lugar bajan los dos a otra fila (editor.css)
    this.setPart('.eb-top', `${this.btnHtml(undo)}
        <div class="eb-title"><b class="eb-name">${esc(this.entry.rec.name)}</b><span class="eb-sub"></span></div>
        <div class="eb-pins">${busy ? '' : this.btnHtml({id: 'more', ic: 'more', label: t('Más'), cls: 'eb-pin'})}
        ${this.btnHtml({id: 'done', ic: 'check', label: t('Listo'), cls: 'eb-pin primary'})}</div>`);
    this.renderStatus();
    this.renderTools();
    this.renderHint();
  }

  setPart(sel, html) {
    const el = this.bar.querySelector(sel);
    if (!el || el.ebHtml === html) return false;
    el.innerHTML = html;
    el.ebHtml = html;
    if (sel === '.eb-top') this.statusShown = null; // .eb-sub se volvió a crear
    return true;
  }

  renderStatus() {
    const el = this.bar.querySelector('.eb-sub');
    const html = this.statusHtml();
    if (el && this.statusShown !== html) {
      el.innerHTML = html;
      el.classList.toggle('bad', this.saveState === 'error'); // «Sin guardar»: en dos líneas si hace falta (editor.css)
      this.statusShown = html;
    }
  }

  renderTools() {
    this.setPart('.eb-tools', this.tools().map((b) => this.btnHtml(b)).join(''));
  }

  renderHint() {
    const el = this.bar.querySelector('#ebHint');
    if (!el || !this.active) return;
    const snack = !!this.snack;
    const html = snack ? esc(this.snack.text) : this.hintHtml();
    el.className = snack ? 'eb-hint snack' : 'eb-hint';
    // Mientras se dibuja o se promedia la frase cambia a cada momento: no se lee en voz alta
    el.setAttribute('aria-live', !snack && (this.drawing || this.avg) ? 'off' : 'polite');
    if (el.ebHtml !== html) {
      el.innerHTML = html; // solo si cambió: así el lector de pantalla no repite la misma frase
      el.ebHtml = html;
    }
  }

  /** Una frase corta: qué tocar ahora. */
  hintHtml() {
    const tl = this.tool;
    if (this.avg) {
      const avg = this.avg;
      const s = Math.min(avg.secs, Math.floor((Date.now() - avg.start) / 1000));
      const r = averageFixes(avg.fixes);
      const msg = tn(avg.fixes.length, 'Promediando: {s} de {total} s · {n} lectura', 'Promediando: {s} de {total} s · {n} lecturas', {s: fmtNum(s), total: fmtNum(avg.secs)});
      const pct = Math.round((100 * s) / avg.secs);
      return `${esc(msg)}${r && r.acc !== null ? ` · <b>±${esc(fmtDist(r.acc))}</b>` : ''}<span class="eb-prog" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
    }
    if ((tl === 'line' || tl === 'polygon') && (this.drawing || this.streaming)) {
      let meas = '';
      if (this.drawing) {
        const g = this.drawing.getGeometry();
        const coords = tl === 'line' ? g.getCoordinates() : g.getCoordinates()[0] || [];
        const ll = coords.map(toLL);
        const pts = tl === 'line' ? ll : ll.slice(0, -1);
        meas = tl === 'line' ? fmtDist(lengthLL(ll)) : pts.length >= 3 ? fmtArea(areaLL(pts)) : '';
      }
      let msg;
      if (this.streaming) {
        if (this.streamWait !== null) msg = t('Esperando mejor señal GPS (ahora ±{acc}).', {acc: accText(this.streamWait)});
        else if (!this.drawing) msg = t('Esperando una buena posición GPS para empezar…');
        else msg = t('Camine: el GPS pone un punto cada {d}.', {d: fmtDist(Number(this.opt.streamM) || 2)});
      } else msg = tl === 'line' ? t('Toque para seguir la línea; «Terminar línea» la guarda.') : t('Toque para agregar esquinas; «Terminar área» la guarda.');
      return meas ? `<b>${esc(meas)}</b> · ${esc(msg)}` : esc(msg);
    }
    const sel = this.selected.getArray();
    if (sel.length && (tl === 'select' || tl === 'move' || tl === 'vertex')) {
      if (tl === 'move') return esc(t('Arrastre lo elegido hasta su nuevo lugar.'));
      if (tl === 'vertex') return esc(this.deleteVertex ? t('Toque una esquina (punto blanco) para quitarla.') : t('Arrastre un punto blanco para moverlo, o uno gris para crear otra esquina.'));
      if (sel.length > 1) return esc(tn(sel.length, '{n} elemento elegido. Toque más para sumarlos o quitarlos.', '{n} elementos elegidos. Toque más para sumarlos o quitarlos.'));
      return esc(t('Elegido: {name}. Elija qué hacer, o toque fuera para soltarlo.', {name: this.label(sel[0])}));
    }
    if (tl === 'select') return esc(this.opt.multi ? t('Toque los elementos que quiere elegir; tóquelos otra vez para soltarlos.') : t('Toque un elemento del mapa para ver o cambiar sus datos.'));
    if (tl === 'point') return esc(t('Toque el mapa donde quiere poner el punto. Se guarda solo.'));
    if (tl === 'line') return esc(t('Toque el mapa donde empieza la línea, o use «Punto GPS».'));
    if (tl === 'polygon') return esc(t('Toque el mapa en la primera esquina, o use «Punto GPS».'));
    if (tl === 'split') return esc(t('Toque la línea en el lugar donde quiere cortarla.'));
    return '';
  }
}

// ---------------------------------------------------------------- coordenadas escritas
const utmDef = (zone, hemi) => `+proj=utm +zone=${zone} ${hemi === 'S' ? '+south ' : ''}+datum=WGS84 +units=m +no_defs`;

/**
 * Diálogo de coordenadas: WGS 84 (grados decimales o GMS) y UTM WGS 84 (zona) en todo el mundo;
 * CRTM05 CR-SIRGAS (EPSG:8908) y CR05 (EPSG:5367) solo en Costa Rica (o en la región EARTH).
 * Los ejemplos salen de la posición de partida. Devuelve [lon, lat] o null.
 */
export async function coordDialog(title, initLL) {
  const regional = inCostaRica(initLL[0], initLL[1]) || settings.region === 'earth';
  const sysOpts = [['wgs', t('WGS 84 · latitud y longitud')], ['utm', 'UTM · WGS 84']];
  if (regional) sysOpts.push(['8908', 'CRTM05 · CR-SIRGAS (EPSG:8908)'], ['5367', 'CRTM05 · CR05 (EPSG:5367)']);
  let sys0 = settings.coordSys || 'wgs';
  if (!sysOpts.some(([v]) => v === sys0)) sys0 = 'wgs';
  let last = {sys: sys0, a: '', b: '', zone: String(utmZone(initLL[0])), hemi: initLL[1] >= 0 ? 'N' : 'S'};
  const labels = (sys) => (sys === 'wgs' ? [t('Latitud'), t('Longitud')] : [t('Este (E, m)'), t('Norte (N, m)')]);
  const examples = (sys, zone, hemi) => {
    try {
      if (sys === 'wgs') return [initLL[1].toFixed(5), initLL[0].toFixed(5)];
      const [e, n] = fromWgs84(sys === 'utm' ? utmDef(Number(zone) || utmZone(initLL[0]), hemi) : `EPSG:${sys}`, initLL);
      return [e.toFixed(1), n.toFixed(1)];
    } catch {
      return ['', ''];
    }
  };
  for (;;) {
    const [la, lb] = labels(last.sys);
    const [xa, xb] = examples(last.sys, last.zone, last.hemi);
    const res = await dialog(
      title,
      `<label class="field"><span>${esc(t('Sistema de coordenadas'))}</span><select id="cdSys">${sysOpts.map(([v, txt]) => `<option value="${v}" ${last.sys === v ? 'selected' : ''}>${esc(txt)}</option>`).join('')}</select></label>
       <div id="cdUtm" class="grid2" ${last.sys === 'utm' ? '' : 'hidden'}>
         <label class="field"><span>${esc(t('Zona UTM'))}</span><input id="cdZone" type="text" inputmode="numeric" autocomplete="off" value="${esc(last.zone)}"></label>
         <label class="field"><span>${esc(t('Hemisferio'))}</span><select id="cdHemi"><option value="N" ${last.hemi === 'N' ? 'selected' : ''}>N</option><option value="S" ${last.hemi === 'S' ? 'selected' : ''}>S</option></select></label>
       </div>
       <div class="grid2">
         <label class="field"><span id="cdLa">${esc(la)}</span><input id="cdA" type="text" inputmode="decimal" autocomplete="off" value="${esc(last.a)}" placeholder="${esc(xa)}"></label>
         <label class="field"><span id="cdLb">${esc(lb)}</span><input id="cdB" type="text" inputmode="decimal" autocomplete="off" value="${esc(last.b)}" placeholder="${esc(xb)}"></label>
       </div>
       <p class="muted small">${esc(regional ? t('Grados decimales (10.2148) o grados, minutos y segundos con N/S y E/O. Para UTM y CRTM05, este y norte en metros.') : t('Grados decimales (10.2148) o grados, minutos y segundos con N/S y E/O. Para UTM, este y norte en metros.'))}</p>`,
      [
        {label: t('Cancelar'), value: null},
        {label: t('Aceptar'), primary: true, value: (w) => ({sys: w.querySelector('#cdSys').value, a: w.querySelector('#cdA').value, b: w.querySelector('#cdB').value, zone: w.querySelector('#cdZone').value, hemi: w.querySelector('#cdHemi').value})},
      ],
      (w) => {
        const sys = w.querySelector('#cdSys');
        const upd = () => {
          const [a, b] = labels(sys.value);
          const [ea, eb] = examples(sys.value, w.querySelector('#cdZone').value, w.querySelector('#cdHemi').value);
          w.querySelector('#cdUtm').hidden = sys.value !== 'utm';
          w.querySelector('#cdLa').textContent = a;
          w.querySelector('#cdLb').textContent = b;
          w.querySelector('#cdA').placeholder = ea;
          w.querySelector('#cdB').placeholder = eb;
        };
        sys.onchange = upd;
        w.querySelector('#cdZone').oninput = upd;
        w.querySelector('#cdHemi').onchange = upd;
      },
    );
    if (!res) return null;
    last = res;
    settings.coordSys = res.sys;
    saveSettings();
    try {
      if (res.sys === 'wgs') {
        const lat = parseAngle(res.a, 'lat');
        const lon = parseAngle(res.b, 'lon');
        return [lon, lat];
      }
      const e = parseNumber(res.a, t('Este'));
      const n = parseNumber(res.b, t('Norte'));
      let def;
      if (res.sys === 'utm') {
        const z = parseLocaleNumber(res.zone);
        if (!Number.isInteger(z) || z < 1 || z > 60) throw new Error(t('La zona UTM es un número entero de 1 a 60.'));
        def = utmDef(z, res.hemi);
      } else def = `EPSG:${res.sys}`;
      const ll = toWgs84(def, [e, n]);
      if (!Number.isFinite(ll[0]) || !Number.isFinite(ll[1]) || Math.abs(ll[1]) > 90) throw new Error(t('Esas coordenadas no caen en un lugar válido. Revise los números y el sistema.'));
      if ((res.sys === '8908' || res.sys === '5367') && !inCostaRica(ll[0], ll[1])) throw new Error(t('Ese este/norte cae fuera de Costa Rica: revise que no estén invertidos.'));
      return ll;
    } catch (err) {
      toast(err.message, 5000);
    }
  }
}

/**
 * Para otras pantallas (p. ej. la ficha de un elemento fuera del editor): etiqueta traducida de
 * una clave de atributo conocida («precision_m» → «Precisión (± m)»); otra clave se devuelve igual.
 */
export const attrLabel = fieldLabel;

/** Texto para mostrar un valor: traduce los códigos de «fuente» y da formato a la fecha y a las medidas de la toma. */
export function attrText(k, v) {
  if (isCaptureValue(k, v)) return fmtCapture(k, v);
  if (typeof v === 'boolean') return v ? t('Sí') : t('No');
  return v === null || v === undefined ? '' : String(v);
}

export {HIDDEN_PROPS};
