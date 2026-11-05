// Pantalla «Planificar»: definir un área (dibujarla, tocar un polígono o usar puntos marcados) y
// generar líneas en serpentina, una cuadrícula de puntos o líneas cruzadas, con vista previa en
// el mapa, resumen, calculadora para dron y exportación.
//
// Textos de la interfaz con t()/tn() (i18n.js). Los campos numéricos son de texto con teclado
// decimal y se leen con parseLocaleNumber() («2,5» o «2.5»); un valor vacío o fuera de rango se
// marca con un aviso y no se usa. Los archivos exportados conservan claves fijas (nombre, linea,
// tipo, largo_m…) y punto decimal, para que otros programas los lean igual en cualquier idioma;
// solo los nombres que lee una persona (p. ej. «Línea 3») van en el idioma elegido.

import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Draw from 'ol/interaction/Draw.js';
import {Style, Stroke, Fill, Circle as CircleStyle, Text} from 'ol/style.js';
import {makePlan, photogrammetry, orderAroundCentroid, ringArea} from './planner.js';
import {fromLL, toLL} from './formats.js';
import {fmtDist, fmtArea} from './geodesy.js';
import {fromWgs84, inCostaRica, localPlane} from './crs.js';
import {settings, saveSettings} from './store.js';
import {$, icon, esc, toast, openSheet, closeSheet, dialog} from './ui.js';
import {t, tn, N_, fmtNum, fmtDateTime, parseLocaleNumber, locale} from './i18n.js';

/** Traduce un texto de las tablas de opciones de este archivo (marcado con N_ al definirlo). */
const tr = (s, params) => t(s, params); // i18n-dynamic

// Cámaras: fichas técnicas oficiales de DJI (consultadas el 2026-11-05).
// «aprox.» = valor derivado porque DJI solo publica la focal equivalente a 35 mm
// o el tamaño de píxel; para trabajo fino, lea la focal real en el EXIF de una foto.
//  - Phantom 4 Pro V2.0 / Phantom 4 RTK: 1", 8.8 mm, 5472×3648; DJI da GSD = H/36.5 (cm/px) para el P4 RTK.
//  - Mavic 3E (gran angular): 4/3, píxel 3.3 µm → 17.42×13.05 mm; 24 mm eq. → ≈ 12.08 mm; 5280×3956.
//  - Matrice 4E (gran angular): 4/3 nominal 17.3×13.0 mm; 24 mm eq. → ≈ 12.0 mm; 5280×3956.
//  - Mini 4 Pro / Air 3 (gran angular): 1/1.3" nominal 9.6×7.2 mm (no publicado); campo de visión 82° → ≈ 6.89 mm; 8064×6048 (48 MP).
// `name` es el texto que se muestra: los modelos sin palabras no se traducen; los demás van con N_().
export const CAMERAS = [
  {id: 'p4rtk', name: 'DJI Phantom 4 RTK', sensorW: 13.2, sensorH: 8.8, focal: 8.8, imgW: 5472, imgH: 3648},
  {id: 'p4pv2', name: 'DJI Phantom 4 Pro V2.0', sensorW: 13.2, sensorH: 8.8, focal: 8.8, imgW: 5472, imgH: 3648},
  {id: 'm3e', name: N_('DJI Mavic 3 Enterprise · gran angular (aprox.)'), sensorW: 17.42, sensorH: 13.05, focal: 12.08, imgW: 5280, imgH: 3956},
  {id: 'm4e', name: N_('DJI Matrice 4E · gran angular (aprox.)'), sensorW: 17.3, sensorH: 13.0, focal: 12.0, imgW: 5280, imgH: 3956},
  {id: 'mini4', name: N_('DJI Mini 4 Pro · 48 MP (aprox.)'), sensorW: 9.6, sensorH: 7.2, focal: 6.89, imgW: 8064, imgH: 6048},
  {id: 'air3', name: N_('DJI Air 3 · gran angular 48 MP (aprox.)'), sensorW: 9.6, sensorH: 7.2, focal: 6.89, imgW: 8064, imgH: 6048},
  {id: 'custom', name: N_('Otra cámara (escriba sus datos)'), sensorW: 13.2, sensorH: 8.8, focal: 8.8, imgW: 5472, imgH: 3648},
];

const DEFAULTS = {
  mode: 'lines', spacing: 5, interval: 5, azimuth: 'auto', margin: 1, start: 'SW', distribution: 'grid', withPoints: true, square: true,
  cam: 'p4rtk', sensorW: 13.2, sensorH: 8.8, focal: 8.8, imgW: 5472, imgH: 3648, altitude: 60, side: 70, front: 80, speed: 5, longAcross: true,
  walkSpeed: 1.0, secPerPoint: 10,
};

// Tipos de plan, esquinas de inicio y reparto de los puntos (códigos neutros; el texto se traduce al mostrarlo)
const MODES = [
  {id: 'lines', name: N_('Líneas en serpentina'), hint: N_('Líneas paralelas de ida y vuelta, para recorrer el área a pie o con un dron.')},
  {id: 'grid', name: N_('Cuadrícula de puntos'), hint: N_('Puntos en filas y columnas, para tomar muestras o medir en cada punto.')},
  {id: 'double', name: N_('Líneas cruzadas'), hint: N_('Dos pasadas de líneas a 90°, como la «doble cuadrícula» de los drones (DJI, Pix4D).')},
];
const STARTS = [
  ['SW', N_('Esquina suroeste')],
  ['SE', N_('Esquina sureste')],
  ['NW', N_('Esquina noroeste')],
  ['NE', N_('Esquina noreste')],
  ['near', N_('Lo más cerca de mí (GPS)')],
];
const DISTS = [
  {id: 'grid', name: N_('Cuadrícula alineada'), hint: N_('Filas y columnas rectas en toda el área, a la distancia exacta.')},
  {id: 'even', name: N_('Repartidos por igual'), hint: N_('El mismo espacio en cada línea, con un punto en cada extremo.')},
  {id: 'exact', name: N_('Desde el inicio de cada línea'), hint: N_('Un punto cada {n} m desde el comienzo de cada línea.')},
];

// Campos numéricos: rango aceptado (se escriben en metros, grados, mm, px, %, km/h o s)
const NUM = {
  spacing: {min: 0.1, max: 5000},
  interval: {min: 0.1, max: 5000},
  margin: {min: 0, max: 1000},
  azimuth: {min: 0, max: 360},
  sensorW: {min: 1, max: 100},
  sensorH: {min: 1, max: 100},
  focal: {min: 1, max: 1000},
  imgW: {min: 100, max: 100000, int: true},
  imgH: {min: 100, max: 100000, int: true},
  altitude: {min: 1, max: 5000},
  speed: {min: 0.5, max: 50},
  side: {min: 0, max: 95},
  front: {min: 0, max: 95},
  walkKmh: {min: 0.5, max: 30},
  secPerPoint: {min: 0, max: 3600},
};
const CAM_KEYS = ['sensorW', 'sensorH', 'focal', 'imgW', 'imgH'];
const CALC_KEYS = [...CAM_KEYS, 'altitude', 'speed', 'side', 'front'];

// Dibujos pequeños de cada tipo de plan (acompañan al texto, no lo reemplazan)
const STROKE = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const pic = (inner) => `<svg viewBox="0 0 52 36" aria-hidden="true">${inner}</svg>`;
const PICS = {
  lines: pic(`<path d="M6 7H44V18H8V29H46" ${STROKE} stroke-width="3"/>`),
  grid: pic([8, 20, 32, 44].flatMap((x) => [7, 18, 29].map((y) => `<circle cx="${x}" cy="${y}" r="3.2" fill="currentColor"/>`)).join('')),
  double: pic(`<path d="M6 8H46M6 18H46M6 28H46M12 3V33M26 3V33M40 3V33" ${STROKE} stroke-width="2.5"/>`),
};
/** Icono de cámara (ui.js no tiene uno): mismo trazo que icon(). */
const CAMERA_ICON = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h4l2-3h6l2 3h4v12H3zM12 17a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" ${STROKE} stroke-width="2"/></svg>`;

// Estilos de la vista previa en el mapa: colores fijos con borde oscuro o claro, para que se vean
// sobre cualquier imagen (ortofoto, mapa base claro u oscuro).
const YELLOW = '#ffeb3b';
const DRAW_STYLE = [
  new Style({stroke: new Stroke({color: 'rgba(0,0,0,0.75)', width: 6})}),
  new Style({
    stroke: new Stroke({color: YELLOW, width: 3}),
    fill: new Fill({color: 'rgba(255,235,59,0.18)'}),
    image: new CircleStyle({radius: 7, fill: new Fill({color: YELLOW}), stroke: new Stroke({color: '#000', width: 2})}),
  }),
  // Cada esquina ya tocada, con un círculo grande (se ve bien con guantes y al sol)
  new Style({
    image: new CircleStyle({radius: 8, fill: new Fill({color: YELLOW}), stroke: new Stroke({color: '#000', width: 2.5})}),
    geometry: (f) => {
      const g = f.getGeometry();
      return g && g.getType() === 'Polygon' ? new MultiPoint(g.getCoordinates()[0].slice(0, -1)) : undefined;
    },
  }),
];
const AREA_STYLE = [
  new Style({stroke: new Stroke({color: 'rgba(0,0,0,0.7)', width: 6})}),
  new Style({stroke: new Stroke({color: YELLOW, width: 3, lineDash: [10, 6]}), fill: new Fill({color: 'rgba(255,235,59,0.10)'})}),
];
const ROUTE_STYLE = [
  new Style({stroke: new Stroke({color: 'rgba(255,255,255,0.85)', width: 4})}),
  new Style({stroke: new Stroke({color: 'rgba(0,0,0,0.75)', width: 2, lineDash: [6, 6]})}),
];
const LINE_STYLE = [new Style({stroke: new Stroke({color: '#ffffff', width: 7})}), new Style({stroke: new Stroke({color: '#00838f', width: 3.5})})];
const POINT_STYLE = new Style({image: new CircleStyle({radius: 4, fill: new Fill({color: '#ffffff'}), stroke: new Stroke({color: '#00313b', width: 2})})});

// ---------------------------------------------------------------- formato de números y textos

let nfIn = null, nfInLocale = '';
/** Número para un campo de texto: separador decimal del idioma, sin separador de miles (2,5 · 5472). */
function fmtIn(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return '';
  if (!nfIn || nfInLocale !== locale()) {
    nfInLocale = locale();
    nfIn = new Intl.NumberFormat(nfInLocale, {maximumFractionDigits: 4, useGrouping: false});
  }
  return nfIn.format(x);
}

const round1 = (v) => Math.round(v * 10) / 10;
/** ¿x está entre lo y hi (incluidos)? */
const inRange = (x, lo, hi) => Math.min(Math.max(x, lo), hi) === x;

/** Duración en minutos → «45 min» o «2 h 05 min». */
function fmtDuration(min) {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return t('{m} min', {m: fmtNum(m)});
  return t('{h} h {m} min', {h: fmtNum(Math.floor(m / 60)), m: String(m % 60).padStart(2, '0')});
}

/** Sentido de las líneas en palabras, con los grados desde el norte. */
function axisText(az) {
  const a = round1((((Number(az) % 180) + 180) % 180));
  const deg = fmtNum(a, Number.isInteger(a) ? 0 : 1);
  const k = Math.round(a / 45) % 4;
  if (k === 0) return t('Las líneas van de norte a sur ({deg}°).', {deg});
  if (k === 1) return t('Las líneas van de noreste a suroeste ({deg}°).', {deg});
  if (k === 2) return t('Las líneas van de este a oeste ({deg}°).', {deg});
  return t('Las líneas van de sureste a noroeste ({deg}°).', {deg});
}

/** Texto para un error de planner.js (PlanError con código y datos). */
function planErrorText(e) {
  const p = (e && e.params) || {};
  switch (e && e.code) {
    case 'area-vertices':
      return t('El área necesita al menos 3 esquinas. Dibújela de nuevo.');
    case 'area-vertices-distinct':
      return t('El área necesita al menos 3 esquinas en lugares distintos. Dibújela de nuevo.');
    case 'bad-spacing':
      return t('La separación entre líneas debe ser mayor que 0.');
    case 'self-intersect':
      return t('El borde del área se cruza a sí mismo. Dibújela de nuevo tocando las esquinas en orden, alrededor del borde.');
    case 'area-too-small':
      return t('El área es demasiado pequeña o sus esquinas están en línea recta. Dibújela de nuevo.');
    case 'too-many-lines':
      return t('Con {s} m entre líneas saldrían más de {max} líneas. Aumente la separación.', {s: fmtIn(p.spacing), max: fmtNum(p.max)});
    case 'too-many-points':
      return t('Con {a} × {b} m saldrían unos {n} puntos (máximo {max}). Aumente la distancia entre puntos.', {a: fmtIn(p.spacing), b: fmtIn(p.interval), n: fmtNum(p.estimate), max: fmtNum(p.max)});
    case 'no-lines':
      return t('Con ese margen y esa separación no cabe ninguna línea en el área. Reduzca el margen o la separación.');
    default:
      return t('No se pudo calcular el plan. Revise los valores e intente de nuevo.');
  }
}

/** Área neta (m²) de un anillo [lon, lat] menos sus huecos, en un plano local. */
function netArea(ring, holes = []) {
  if (!ring || ring.length < 3) return 0;
  const pl = localPlane(ring[0][0], ring[0][1]);
  const a = (r) => Math.abs(ringArea(r.map((q) => pl.fwd(q))));
  return a(ring) - holes.reduce((s, h) => s + a(h), 0);
}

export class Planner {
  /**
   * @param {object} ctx {map, nav, gps, waypoints, saveText, utmCode, savePlanLayers(name, linesGeoJSON, pointsGeoJSON)}
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.p = Object.assign({}, DEFAULTS, settings.planner || {});
    // Versiones anteriores guardaban la esquina con letras del español (SO = suroeste, NO = noroeste)
    if (this.p.start === 'SO') this.p.start = 'SW';
    if (this.p.start === 'NO') this.p.start = 'NW';
    if (!STARTS.some(([v]) => v === this.p.start)) this.p.start = 'SW';
    if (!MODES.some((m) => m.id === this.p.mode)) this.p.mode = 'lines';
    this.ring = null; // [lon,lat] del área (exterior, antihorario)
    this.holes = []; // huecos (horario)
    this.plan = null;
    this.invalid = new Set(); // campos con un valor que no se pudo usar
    this.src = new VectorSource();
    this.layer = new VectorLayer({source: this.src, zIndex: 820, updateWhileInteracting: true});
    this.layer.set('system', true);
    ctx.map.addLayer(this.layer);
    this.drawSrc = new VectorSource();
    this.corners = 0;
  }

  saveParams() {
    settings.planner = this.p;
    saveSettings();
  }

  // ------------------------------------------------------------ área
  setAreaFromPoints(ll, label) {
    this.setArea(orderAroundCentroid(ll), label);
  }

  /**
   * @param {number[][]} ring exterior [lon, lat] (cerrado o no, en cualquier sentido)
   * @param {string} label de dónde vino el área (se muestra tal cual)
   * @param {number[][][]} [holes] huecos del polígono
   */
  setArea(ring, label, holes = []) {
    const open = (rr) => {
      const r = rr.slice();
      const f = r[0], l = r[r.length - 1];
      if (r.length > 3 && f[0] === l[0] && f[1] === l[1]) r.pop();
      return r;
    };
    // GeoJSON (RFC 7946) y KML piden el exterior en sentido antihorario y los huecos en horario
    const outer = open(ring);
    this.ring = ringArea(outer) < 0 ? outer.reverse() : outer;
    this.holes = (holes || []).map(open).filter((h) => h.length >= 3).map((h) => (ringArea(h) > 0 ? h.reverse() : h));
    this.areaLabel = label;
    this.compute();
  }

  // ------------------------------------------------------------ dibujar el área
  // Usa la barra de medir (#measureBar): «Quitar esquina» (#mUndo), «Cancelar» (#mClose) y
  // «Terminar área» (#mDone). main.js conecta los botones con undoDraw(), stopDraw() y finishDraw().
  startDraw() {
    closeSheet();
    this.stopDraw();
    this.drawSrc.clear();
    this.corners = 0;
    this.sketch = null;
    this.draw = new Draw({source: this.drawSrc, type: 'Polygon', style: DRAW_STYLE});
    this.draw.on('drawstart', (e) => {
      const geom = e.feature.getGeometry();
      const update = () => this.onSketch(geom);
      geom.on('change', update);
      update();
    });
    this.draw.on('drawabort', () => {
      this.corners = 0;
      this.sketch = null;
      this.updateDrawBar();
    });
    this.draw.on('drawend', (e) => {
      this.lastDrawEnd = Date.now(); // el toque que cierra el área no debe abrir otra ficha
      const ring = e.feature.getGeometry().getCoordinates()[0].map(toLL);
      setTimeout(() => {
        this.stopDraw();
        this.setArea(ring, t('Dibujada en el mapa'));
        this.open();
      }, 0);
    });
    this.ctx.map.addInteraction(this.draw);
    document.body.classList.add('measuring', 'plan-drawing');
    // Se guardan los textos de la barra para devolverlos al terminar (la usa también «Medir»)
    this.barSaved = ['#mUndo', '#mClose', '#mDone']
      .map((sel) => $(sel))
      .filter(Boolean)
      .map((el) => ({el, text: el.textContent, disabled: el.disabled, aria: el.getAttribute('aria-label')}));
    $('#measureBar').hidden = false;
    this.drawing = true;
    this.updateDrawBar();
  }

  /**
   * El dibujo cambió: cuenta las esquinas ya tocadas. El anillo del boceto trae además el punto
   * que sigue al dedo y el cierre, así que el área solo cambia cuando cambia la cantidad de esquinas.
   */
  onSketch(geom) {
    const ring = geom.getCoordinates()[0] || [];
    const n = Math.max(0, ring.length - 2);
    if (n === this.corners) return;
    this.corners = n;
    this.sketch = n >= 3 ? ring.slice(0, n).map(toLL) : null;
    this.updateDrawBar();
  }

  /** Instrucción, estado y botones de la barra mientras se dibuja. */
  updateDrawBar() {
    if (!this.drawing) return;
    const n = this.corners || 0;
    const line = n < 3 ? t('Toque el mapa en cada esquina del área, una tras otra.') : t('Siga tocando esquinas, o toque «Terminar área» cuando acabe.');
    let status;
    if (n === 0) status = t('Se necesitan al menos 3 esquinas.');
    else if (n < 3) status = tn(3 - n, 'Falta {n} esquina para poder terminar.', 'Faltan {n} esquinas para poder terminar.');
    else status = tn(n, '{n} esquina · {area}', '{n} esquinas · {area}', {area: fmtArea(netArea(this.sketch))});
    const txt = $('#measureTxt');
    if (txt) txt.innerHTML = `<span class="pd-line">${esc(line)}</span><span class="pd-status" aria-live="polite">${esc(status)}</span>`;
    const undo = $('#mUndo'), cancel = $('#mClose'), done = $('#mDone');
    if (undo) {
      undo.textContent = t('Quitar esquina');
      undo.setAttribute('aria-label', t('Quitar la última esquina'));
      undo.disabled = n === 0;
    }
    if (cancel) {
      cancel.textContent = t('Cancelar');
      cancel.setAttribute('aria-label', t('Cancelar el dibujo'));
      cancel.disabled = false;
    }
    if (done) {
      done.textContent = t('Terminar área');
      done.removeAttribute('aria-label');
      done.disabled = n < 3;
    }
  }

  /**
   * Termina el área con las esquinas tocadas (botón «Terminar área»). Con menos de 3 esquinas
   * avisa cuántas faltan. Devuelve true si el área quedó cerrada.
   */
  finishDraw() {
    if (!this.drawing || !this.draw) return false;
    const n = this.corners || 0;
    if (n < 3) {
      toast(n === 0 ? t('Toque el mapa en cada esquina del área: se necesitan al menos 3.') : tn(3 - n, 'Falta {n} esquina: toque el mapa para agregarla.', 'Faltan {n} esquinas: toque el mapa para agregarlas.'), 4000);
      return false;
    }
    this.draw.finishDrawing(); // dispara «drawend», que guarda el área y vuelve a abrir el panel
    return true;
  }

  stopDraw() {
    if (this.draw) this.ctx.map.removeInteraction(this.draw);
    this.draw = null;
    if (this.drawing) {
      document.body.classList.remove('measuring', 'plan-drawing');
      $('#measureBar').hidden = true;
      for (const b of this.barSaved || []) {
        b.el.textContent = b.text;
        b.el.disabled = b.disabled;
        if (b.aria === null) b.el.removeAttribute('aria-label');
        else b.el.setAttribute('aria-label', b.aria);
      }
      const txt = $('#measureTxt');
      if (txt) txt.textContent = '';
      this.barSaved = null;
    }
    this.drawing = false;
    this.corners = 0;
    this.sketch = null;
  }

  /** Quita la última esquina tocada (botón «Quitar esquina»). */
  undoDraw() {
    if (this.draw) this.draw.removeLastPoint();
  }

  // ------------------------------------------------------------ cálculo y vista previa
  compute() {
    this.plan = null;
    this.error = null;
    this.savedNote = null;
    if (!this.ring) return this.drawPreview();
    const fix = this.ctx.gps.fix;
    this.nearFallback = this.p.start === 'near' && !fix;
    try {
      this.plan = makePlan(this.holes.length ? {outer: this.ring, holes: this.holes} : this.ring, {
        mode: this.p.mode,
        spacing: Number(this.p.spacing),
        interval: Number(this.p.interval),
        azimuth: this.p.azimuth === 'auto' ? 'auto' : Number(this.p.azimuth),
        margin: Number(this.p.margin),
        start: this.p.start === 'near' && !fix ? 'SW' : this.p.start,
        nearLL: fix ? [fix.lon, fix.lat] : null,
        distribution: this.p.distribution,
        withPoints: this.p.withPoints,
      });
    } catch (e) {
      this.error = e;
    }
    this.drawPreview();
  }

  drawPreview() {
    this.src.clear();
    if (!this.ring) return;
    const area = new Feature(new Polygon(this.areaRings().map((r) => r.map(fromLL))));
    area.setStyle(AREA_STYLE);
    this.src.addFeature(area);
    if (!this.plan) return;
    const route = new Feature(new LineString(this.plan.route.map(fromLL)));
    route.setStyle(ROUTE_STYLE);
    this.src.addFeature(route);
    const numbered = this.plan.lines.length <= 40; // con pocas líneas, el número de cada una en su inicio
    for (const l of this.plan.lines) {
      const f = new Feature(new LineString(l.coords.map(fromLL)));
      f.setStyle(LINE_STYLE);
      this.src.addFeature(f);
      if (numbered && l.line > 1) {
        const n = new Feature(new Point(fromLL(l.coords[0])));
        n.setStyle(new Style({text: new Text({text: String(l.line), font: '700 12px system-ui, sans-serif', offsetY: -12, fill: new Fill({color: '#00313b'}), stroke: new Stroke({color: '#ffffff', width: 3.5})})}));
        this.src.addFeature(n);
      }
    }
    if (this.plan.points.length <= 6000) {
      for (const p of this.plan.points) {
        const f = new Feature(new Point(fromLL(p.ll)));
        f.setStyle(POINT_STYLE);
        this.src.addFeature(f);
      }
    }
    const label = (text) => new Text({text, offsetY: -20, font: '800 14px system-ui, sans-serif', fill: new Fill({color: '#000000'}), stroke: new Stroke({color: '#ffffff', width: 4})});
    const end = new Feature(new Point(fromLL(this.plan.route[this.plan.route.length - 1])));
    end.setStyle(new Style({image: new CircleStyle({radius: 7, fill: new Fill({color: '#d50000'}), stroke: new Stroke({color: '#ffffff', width: 2.5})}), text: label(t('Fin'))}));
    this.src.addFeature(end);
    const s = new Feature(new Point(fromLL(this.plan.route[0])));
    s.setStyle(new Style({image: new CircleStyle({radius: 9, fill: new Fill({color: '#00c853'}), stroke: new Stroke({color: '#ffffff', width: 3})}), text: label(t('Inicio'))}));
    this.src.addFeature(s);
  }

  clear() {
    this.ring = null;
    this.holes = [];
    this.plan = null;
    this.error = null;
    this.savedNote = null;
    this.src.clear();
  }

  /** Anillos cerrados del área: exterior y huecos. */
  areaRings() {
    return [this.ring, ...this.holes].map((r) => [...r, r[0]]);
  }

  /** Minutos a pie: ruta completa a la velocidad elegida más el tiempo en cada punto. */
  walkMinutes() {
    const s = this.plan.stats;
    return (s.routeLength / Math.max(0.1, Number(this.p.walkSpeed)) + s.nPoints * Number(this.p.secPerPoint)) / 60;
  }

  /** Actualiza el resumen, la dirección, el pie y los botones sin redibujar el panel. */
  refreshStats() {
    if (!this.body || !this.body.isConnected) return;
    const st = this.body.querySelector('#plStats');
    if (st) st.innerHTML = this.statsHtml();
    const dir = this.body.querySelector('#plDir');
    if (dir) dir.innerHTML = this.dirHtml();
    const foot = this.body.querySelector('#plFoot');
    if (foot) foot.innerHTML = this.footHtml();
    const exp = this.body.querySelector('[data-a="export"]');
    if (exp) exp.disabled = !this.canSave();
    this.syncChips();
  }

  canSave() {
    return !!this.plan && !this.saving && !this.invalid.size;
  }

  /** Llega una posición GPS: si el inicio «más cerca de mí» estaba sin posición, se recalcula. */
  onFix() {
    if (!this.nearFallback || !this.ring || this.drawing || this.saving) return;
    this.compute();
    this.refreshStats();
  }

  /** Resumen del plan (tabla) con avisos. */
  statsHtml() {
    if (!this.ring || !this.plan) return '';
    const s = this.plan.stats;
    const p = this.p;
    const row = (k, v) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
    const sub = (x) => `<small>${esc(x)}</small>`;
    const rows = [
      row(t('Área'), esc(fmtArea(s.area))),
      row(t('Perímetro'), esc(fmtDist(s.perimeter))),
      row(t('Dirección de las líneas'), esc(axisText(s.azimuth)) + (p.azimuth === 'auto' ? sub(t('Automática: paralelas al lado más largo.')) : '')),
    ];
    if (p.mode === 'grid') {
      rows.push(row(t('Cuadrícula'), esc(t('{a} × {b} m: un punto cada {s} m²', {a: fmtIn(s.spacing), b: fmtIn(s.interval), s: fmtIn(+(s.spacing * s.interval).toFixed(4))}))));
    } else {
      rows.push(row(t('Separación entre líneas'), esc(s.nPoints ? t('{a} m · un punto cada {b} m', {a: fmtIn(s.spacing), b: fmtIn(s.interval)}) : `${fmtIn(s.spacing)} m`)));
    }
    rows.push(row(t('Líneas'), esc(tn(s.nLines, '{n} línea · {len} en total', '{n} líneas · {len} en total', {len: fmtDist(s.linesLength)}))));
    rows.push(row(t('Largo total de la ruta'), esc(fmtDist(s.routeLength)) + sub(t('Incluye los cambios de una línea a la siguiente.'))));
    if (s.nPoints) {
      const pts = this.plan.points;
      rows.push(row(t('Puntos'), esc(tn(s.nPoints, '{n} punto ({first})', '{n} puntos, de {first} a {last}', {first: pts[0].name, last: pts[pts.length - 1].name}))));
    }
    const kmh = fmtIn(round1(Number(p.walkSpeed) * 3.6));
    rows.push(row(t('Tiempo estimado a pie'), esc(`≈ ${fmtDuration(this.walkMinutes())}`) + sub(s.nPoints ? t('A {v} km/h, con {s} s en cada punto.', {v: kmh, s: fmtIn(p.secPerPoint)}) : t('A {v} km/h.', {v: kmh}))));
    if (p.mode === 'double') rows.push(row(t('Pasadas'), esc(t('Dos, cruzadas a 90°'))));
    if (s.holes) rows.push(row(t('Zonas excluidas'), esc(tn(s.holes, '{n} zona dentro del área, donde no se planifica', '{n} zonas dentro del área, donde no se planifica'))));
    if (s.cells > 1) rows.push(row(t('Partes'), esc(tn(s.cells, 'El área tiene forma irregular: se recorre en {n} parte.', 'El área tiene forma irregular: se recorre en {n} partes, una tras otra.'))));
    const notes = [];
    if (this.savedNote) notes.push(['info', t('Puede exportarlo, o cambiar valores y guardar otra versión.')]);
    if (this.nearFallback) notes.push(['warn', t('Todavía no hay posición GPS: el plan empieza en la esquina suroeste. Se recalcula solo cuando llegue la posición.')]);
    if (s.pointsSkipped) notes.push(['warn', t('Con un punto cada {i} m saldrían más de {max} puntos, así que solo se crearon las líneas. Para tener puntos, aumente la distancia entre puntos.', {i: fmtIn(s.interval), max: fmtNum(s.maxPoints)})]);
    if (s.reordered) notes.push(['warn', t('Las esquinas estaban en un orden que cruzaba el borde; se ordenaron alrededor del centro. Revise la vista previa.')]);
    return `<h3 class="pl-h">${esc(t('Resumen del plan'))}</h3>${notes.map(([c, x]) => `<p class="note ${c}">${esc(x)}</p>`).join('')}<table class="kv">${rows.join('')}</table>`;
  }

  /** Línea bajo «Dirección»: hacia dónde van las líneas ahora. */
  dirHtml() {
    if (!this.plan) return '';
    return `${icon('compass')}<span>${esc(axisText(this.plan.stats.azimuth))}</span>`;
  }

  /** Pie fijo del panel: estado en una línea y los botones de guardar. */
  footHtml() {
    const s = this.plan && this.plan.stats;
    let cls = '', txt;
    if (!this.ring || (!s && !this.error && !this.invalid.size)) {
      cls = 'info';
      txt = t('Defina el área para ver el plan.');
    } else if (this.invalid.size) {
      cls = 'bad';
      txt = t('Hay un valor que no es válido. Corríjalo para actualizar el plan.');
    } else if (this.error) {
      cls = 'bad';
      txt = planErrorText(this.error);
    } else if (this.saving) {
      txt = t('Guardando…');
    } else {
      const parts = [tn(s.nLines, '{n} línea', '{n} líneas')];
      if (s.nPoints) parts.push(tn(s.nPoints, '{n} punto', '{n} puntos'));
      parts.push(t('≈ {time} a pie', {time: fmtDuration(this.walkMinutes())}));
      txt = parts.join(' · ');
    }
    const dis = this.canSave() ? '' : 'disabled';
    return `${this.savedNote ? `<p class="pl-sum ok" role="status">${icon('check')}<span>${esc(this.savedNote)}</span></p>` : ''}
      <p class="pl-sum ${cls}" aria-live="polite">${cls === 'bad' ? icon('info') : ''}<span>${esc(txt)}</span></p>
      <div class="pl-foot-btns">
        <button type="button" class="btn tonal" data-a="save" ${dis} aria-label="${esc(t('Guardar el plan como capas'))}">${icon('layers')}<span>${esc(t('Guardar'))}</span></button>
        <button type="button" class="btn primary" data-a="follow" ${dis}>${icon('route')}<span>${esc(t('Guardar y seguir'))}</span></button>
      </div>`;
  }

  // ------------------------------------------------------------ pantalla
  /** Campo de número (texto con teclado decimal). */
  numInput(k, hintId = '') {
    const spec = NUM[k];
    const val = k === 'walkKmh' ? round1(Number(this.p.walkSpeed) * 3.6) : this.p[k];
    const desc = [`pl-err-${k}`, hintId].filter(Boolean).join(' ');
    return `<input type="text" inputmode="${spec.int ? 'numeric' : 'decimal'}" autocomplete="off" enterkeyhint="done" id="pl-${k}" data-k="${k}" value="${esc(fmtIn(val))}" aria-describedby="${desc}">`;
  }

  errSlot(k) {
    return `<small class="pl-err" id="pl-err-${k}" data-err="${k}" role="alert" hidden></small>`;
  }

  /** Campo con etiqueta, ayuda opcional y aviso de error. */
  field(k, label, hint = '') {
    const hintId = hint ? `pl-hint-${k}` : '';
    return `<div class="field"><label for="pl-${k}">${esc(label)}</label>${this.numInput(k, hintId)}${hint ? `<small class="hint" id="${hintId}">${esc(hint)}</small>` : ''}${this.errSlot(k)}</div>`;
  }

  /** Opción de una lista de selección única, como tarjeta (texto + ayuda + marca). */
  optHtml(group, value, on, title, hint, art = '') {
    const dk = group === 'xf' ? '' : `data-k="${group}"`;
    return `<label class="pl-opt ${on ? 'on' : ''}"><input type="radio" name="pl-${group}" value="${esc(value)}" ${dk} ${on ? 'checked' : ''}>${art ? `<span class="pl-pic">${art}</span>` : ''}<span class="pl-txt"><b>${esc(title)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span><span class="pl-check" aria-hidden="true">${icon('check')}</span></label>`;
  }

  /** Bloque de medidas: cuadrícula X × Y m, o separación de las líneas (y puntos sobre ellas). */
  resolutionHtml() {
    const p = this.p;
    const chips = (presets, grid) => `<div class="chips" role="group" aria-label="${esc(t('Medidas rápidas'))}">${presets
      .map((v) => {
        const label = grid ? `${fmtIn(v)} × ${fmtIn(v)} m` : `${fmtIn(v)} m`;
        return `<button type="button" class="chip-btn" data-a="res" data-sp="${v}" data-iv="${grid ? v : ''}" data-label="${esc(label)}" aria-pressed="false">${esc(label)}</button>`;
      })
      .join('')}</div>`;
    if (p.mode === 'grid') {
      return `<div class="res-box">
        <div class="res-title">${esc(t('Distancia entre puntos de la cuadrícula'))}</div>
        <div class="res-row">
          <div class="res-in"><label for="pl-spacing">${esc(t('Entre filas (m)'))}</label>${this.numInput('spacing', 'pl-res-hint')}</div>
          <span class="res-x" aria-hidden="true">×</span>
          <div class="res-in"><label for="pl-interval">${esc(t('Entre puntos (m)'))}</label>${this.numInput('interval', 'pl-res-hint')}</div>
        </div>
        ${this.errSlot('spacing')}${this.errSlot('interval')}
        <p class="res-hint" id="pl-res-hint">${esc(t('Entre filas: de una fila de puntos a la siguiente. Entre puntos: de un punto al siguiente en la misma fila.'))}</p>
        <label class="switch"><input type="checkbox" data-k="square" ${p.square ? 'checked' : ''}><span>${esc(t('Cuadrícula cuadrada'))}<small>${esc(t('El mismo valor en los dos sentidos.'))}</small></span></label>
        ${chips([1, 2, 5, 10, 20, 25, 50], true)}
      </div>`;
    }
    const pts = p.mode === 'lines' && p.withPoints;
    return `<div class="res-box">
      <div class="res-one">
        <label class="res-title" for="pl-spacing">${esc(t('Separación entre líneas (m)'))}</label>
        ${this.numInput('spacing', 'pl-hint-spacing')}
        <p class="res-hint" id="pl-hint-spacing">${esc(p.mode === 'double' ? t('De una línea a la siguiente; la misma en las dos pasadas.') : t('De una línea a la siguiente.'))}</p>
        ${this.errSlot('spacing')}
      </div>
      ${chips([1, 2, 5, 10, 20, 30, 50], false)}
      ${p.mode === 'lines' ? `<label class="switch"><input type="checkbox" data-k="withPoints" ${p.withPoints ? 'checked' : ''}><span>${esc(t('Marcar también puntos sobre las líneas'))}<small>${esc(t('Para tomar muestras o medir en cada punto.'))}</small></span></label>` : ''}
      ${pts ? `<div class="res-one">
        <label class="res-title" for="pl-interval">${esc(t('Distancia entre puntos (m)'))}</label>
        ${this.numInput('interval', 'pl-hint-interval')}
        <p class="res-hint" id="pl-hint-interval">${esc(t('De un punto al siguiente, sobre la misma línea.'))}</p>
        ${this.errSlot('interval')}
      </div>` : ''}
    </div>`;
  }

  /** Marca la medida rápida que coincide con los valores actuales (con una marca, no solo color). */
  syncChips() {
    if (!this.body) return;
    const grid = this.p.mode === 'grid';
    this.body.querySelectorAll('[data-a="res"]').forEach((b) => {
      const sp = Number(b.dataset.sp);
      const on = Number(this.p.spacing) === sp && (!grid || Number(this.p.interval) === Number(b.dataset.iv));
      if (b.classList.contains('on') === on && b.dataset.ready) return;
      b.dataset.ready = '1';
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = `${on ? icon('check') : ''}${esc(b.dataset.label)}`;
    });
  }

  /** Paso 1 del panel: el área y cómo definirla. */
  areaHtml(nWp) {
    const has = !!this.ring;
    let wpsHint;
    if (nWp === 0) wpsHint = t('Para usar sus puntos, marque primero cada esquina con «Marcar».');
    else if (nWp < 3) wpsHint = tn(nWp, 'Tiene {n} punto marcado; se necesitan 3 o más.', 'Tiene {n} puntos marcados; se necesitan 3 o más.');
    else wpsHint = tn(nWp, 'Usa su {n} punto marcado como esquina.', 'Usa sus {n} puntos marcados como esquinas.');
    return `<h3 class="pl-h"><span class="pl-n" aria-hidden="true">1</span>${esc(t('Área'))}</h3>
      ${has ? `<div class="pl-area"><b>${esc(fmtArea(this.plan ? this.plan.stats.area : netArea(this.ring, this.holes)))}</b><span>${esc(this.areaLabel || '')}</span></div>` : `<p class="note info">${esc(t('Primero defina el área: dibújela en el mapa, toque un polígono de una capa o use 3 o más puntos marcados.'))}</p>`}
      <div class="pl-src">
        <button type="button" class="btn ${has ? '' : 'primary'}" data-a="draw">${icon('poly')}<span>${esc(has ? t('Dibujar otra') : t('Dibujar área'))}</span></button>
        <button type="button" class="btn" data-a="wps" ${nWp >= 3 ? '' : 'disabled'} aria-describedby="pl-wps-hint">${icon('pin')}<span>${esc(t('Usar mis puntos'))}</span></button>
      </div>
      <p class="pl-hint" id="pl-wps-hint">${esc(wpsHint)}</p>
      ${has ? '' : `<p class="pl-hint">${esc(t('También puede tocar un polígono en el mapa y elegir planificar en esa área.'))}</p>`}`;
  }

  open() {
    const p = this.p;
    this.invalid = new Set();
    const nWp = this.ctx.waypoints.list.length;
    const pointsOn = p.mode === 'grid' || (p.mode === 'lines' && p.withPoints);
    const auto = p.azimuth === 'auto';
    const camOpts = CAMERAS.map((c) => `<option value="${c.id}" ${p.cam === c.id ? 'selected' : ''}>${esc(tr(c.name))}</option>`).join('');
    const modeOpts = MODES.map((m) => this.optHtml('mode', m.id, p.mode === m.id, tr(m.name), tr(m.hint), PICS[m.id])).join('');
    const distOpts = DISTS.map((d) => this.optHtml('distribution', d.id, p.distribution === d.id, tr(d.name), tr(d.hint, {n: fmtIn(p.interval)}))).join('');
    const html = `<div class="plan">
      ${this.areaHtml(nWp)}
      <h3 class="pl-h" id="pl-mode-lbl"><span class="pl-n" aria-hidden="true">2</span>${esc(t('Tipo de plan'))}</h3>
      <div class="pl-opts" role="radiogroup" aria-labelledby="pl-mode-lbl">${modeOpts}</div>
      <h3 class="pl-h"><span class="pl-n" aria-hidden="true">3</span>${esc(t('Medidas'))}</h3>
      ${this.resolutionHtml()}
      ${this.field('margin', t('Margen desde el borde (m)'), t('Franja que se deja libre junto al borde: cercas, zanjas, caminos.'))}
      <h3 class="pl-h"><span class="pl-n" aria-hidden="true">4</span>${esc(t('Dirección e inicio'))}</h3>
      <div class="field"><span id="pl-dir-lbl">${esc(t('Dirección de las líneas'))}</span>
        <div class="seg" role="group" aria-labelledby="pl-dir-lbl">
          <button type="button" data-a="dirAuto" class="${auto ? 'on' : ''}" aria-pressed="${auto}">${esc(t('Automática'))}</button>
          <button type="button" data-a="dirManual" class="${auto ? '' : 'on'}" aria-pressed="${!auto}">${esc(t('Manual'))}</button>
        </div>
        <small class="hint">${esc(auto ? t('Paralelas al lado más largo del área, para dar menos vueltas.') : t('Grados desde el norte: 0 = de norte a sur, 90 = de este a oeste.'))}</small>
      </div>
      ${auto ? '' : `<div class="pl-dir">${this.field('azimuth', t('Grados desde el norte'))}<button type="button" class="btn" data-a="rot90">${esc(t('Girar 90°'))}</button></div>`}
      <p class="pl-now" id="plDir">${this.dirHtml()}</p>
      <div class="field"><label for="pl-start">${esc(t('Dónde empieza el plan'))}</label><select id="pl-start" data-k="start" aria-describedby="pl-start-hint">${STARTS.map(([v, name]) => `<option value="${v}" ${p.start === v ? 'selected' : ''}>${esc(tr(name))}</option>`).join('')}</select><small class="hint" id="pl-start-hint">${esc(t('Esquina donde empieza la línea 1.'))}</small></div>
      <div id="plStats" class="pl-stats">${this.statsHtml()}</div>
      <details class="pl-more" data-d="more" ${this.moreOpen ? 'open' : ''}>
        <summary>${icon('gear')}<span>${esc(t('Más opciones'))}</span></summary>
        ${pointsOn ? `<p class="pl-sub" id="pl-dist-lbl">${esc(t('Cómo se colocan los puntos'))}</p>
        <div class="pl-opts" role="radiogroup" aria-labelledby="pl-dist-lbl">${distOpts}</div>` : ''}
        <p class="pl-sub">${esc(t('Para calcular el tiempo a pie'))}</p>
        <div class="grid2">${this.field('walkKmh', t('Velocidad al caminar (km/h)'))}${pointsOn ? this.field('secPerPoint', t('Segundos en cada punto')) : ''}</div>
      </details>
      <details class="pl-more calc" data-d="calc" ${this.calcOpen ? 'open' : ''}>
        <summary>${CAMERA_ICON}<span>${esc(t('Calculadora para dron'))}</span></summary>
        <p class="pl-hint">${esc(t('Calcula la separación entre líneas y entre fotos con la cámara, la altura y el traslape, como DJI Pilot 2 o Pix4Dcapture. Lo típico: 70 % lateral y 80 % frontal.'))}</p>
        <div class="field"><label for="pl-cam">${esc(t('Cámara'))}</label><select id="pl-cam" data-k="cam" aria-describedby="pl-cam-hint">${camOpts}</select><small class="hint" id="pl-cam-hint">${esc(t('«aprox.»: datos calculados de la ficha de DJI. Para más exactitud, use la distancia focal real que aparece en los datos EXIF de una foto.'))}</small></div>
        <div class="grid2">
          ${this.field('sensorW', t('Ancho del sensor (mm)'))}
          ${this.field('sensorH', t('Alto del sensor (mm)'))}
          ${this.field('focal', t('Distancia focal real (mm)'))}
          ${this.field('altitude', t('Altura sobre el terreno (m)'))}
          ${this.field('imgW', t('Ancho de la foto (px)'))}
          ${this.field('imgH', t('Alto de la foto (px)'))}
          ${this.field('side', t('Traslape lateral (%)'))}
          ${this.field('front', t('Traslape frontal (%)'))}
          ${this.field('speed', t('Velocidad de vuelo (m/s)'))}
        </div>
        <label class="switch"><input type="checkbox" data-k="longAcross" ${p.longAcross ? 'checked' : ''}><span>${esc(t('Lado largo de la foto perpendicular a la línea de vuelo'))}<small>${esc(t('Así vuela la mayoría de los drones.'))}</small></span></label>
        <div id="plCalc" aria-live="polite"></div>
        <div class="row-actions"><button type="button" class="btn tonal" data-a="applyCam">${icon('check')}<span>${esc(t('Usar en el plan'))}</span></button></div>
      </details>
      <div class="row-actions col">
        <button type="button" class="btn" data-a="export" ${this.canSave() ? '' : 'disabled'}>${icon('share')}<span>${esc(t('Exportar…'))}</span></button>
        <button type="button" class="btn danger" data-a="clear" ${this.ring ? '' : 'disabled'}>${icon('trash')}<span>${esc(t('Borrar área y plan'))}</span></button>
      </div>
      <div class="pl-foot" id="plFoot">${this.footHtml()}</div>
    </div>`;
    const body = openSheet(t('Planificar líneas o cuadrícula'), html, {wide: true});
    this.body = body;
    this.renderCalc();
    this.syncChips();
    body.addEventListener('change', (e) => this.onInput(e));
    body.addEventListener('input', (e) => {
      if (NUM[e.target.dataset.k]) this.onInput(e, true);
    });
    body.addEventListener('click', (e) => this.onClick(e));
    // «toggle» no burbujea: se escucha en cada sección plegable para recordar si quedó abierta
    body.querySelectorAll('details[data-d]').forEach((d) =>
      d.addEventListener('toggle', () => {
        if (d.dataset.d === 'more') this.moreOpen = d.open;
        else this.calcOpen = d.open;
      }),
    );
  }

  /** Lee un campo de número; si no sirve, lo marca y explica qué escribir. Devuelve null si no sirve. */
  readNum(el, k) {
    const spec = NUM[k];
    const x = parseLocaleNumber(el.value);
    const good = Number.isFinite(x) && inRange(x, spec.min, spec.max) && (!spec.int || Number.isInteger(x));
    const msg = good
      ? ''
      : spec.int
        ? t('Escriba un número entero de {min} a {max}.', {min: fmtIn(spec.min), max: fmtIn(spec.max)})
        : t('Escriba un número de {min} a {max}.', {min: fmtIn(spec.min), max: fmtIn(spec.max)});
    this.setInvalid(k, msg);
    return good ? x : null;
  }

  setInvalid(k, msg) {
    if (msg) this.invalid.add(k);
    else this.invalid.delete(k);
    if (!this.body) return;
    const input = this.body.querySelector(`[data-k="${k}"]`);
    if (input) {
      if (msg) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
    const slot = this.body.querySelector(`[data-err="${k}"]`);
    if (slot) {
      slot.textContent = msg;
      slot.hidden = !msg;
    }
  }

  /** Pone un valor en un campo de número (y borra su aviso, si tenía). */
  setField(k, v) {
    const el = this.body && this.body.querySelector(`[data-k="${k}"]`);
    if (el) el.value = fmtIn(v);
    this.setInvalid(k, '');
  }

  onInput(e, live = false) {
    const el = e.target;
    const k = el.dataset.k;
    if (!k) return;
    if (el.type === 'radio' && !el.checked) return;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (NUM[k]) {
      v = this.readNum(el, k);
      if (v === null) {
        if (CALC_KEYS.includes(k)) this.renderCalc();
        return this.refreshStats(); // el plan sigue con el último valor bueno, y el pie lo avisa
      }
    } else v = el.value;
    if (k === 'walkKmh') this.p.walkSpeed = v / 3.6;
    else this.p[k] = v;
    // Cuadrícula cuadrada: un valor mueve el otro
    if (this.p.square && this.p.mode === 'grid' && (k === 'spacing' || k === 'interval')) {
      const other = k === 'spacing' ? 'interval' : 'spacing';
      this.p[other] = v;
      this.setField(other, v);
    }
    if (k === 'square' && v) this.p.interval = this.p.spacing;
    if (k === 'mode' && v === 'grid' && this.p.distribution !== 'grid' && !this.p.distributionChosen) this.p.distribution = 'grid';
    if (k === 'distribution') this.p.distributionChosen = true;
    if (['mode', 'withPoints', 'square', 'distribution'].includes(k)) {
      this.saveParams();
      this.compute();
      return this.reopen();
    }
    if (k === 'cam') {
      const c = CAMERAS.find((x) => x.id === v);
      if (c && c.id !== 'custom') {
        Object.assign(this.p, {sensorW: c.sensorW, sensorH: c.sensorH, focal: c.focal, imgW: c.imgW, imgH: c.imgH});
        CAM_KEYS.forEach((q) => this.setField(q, this.p[q]));
      }
    }
    if (CAM_KEYS.includes(k)) {
      this.p.cam = 'custom';
      const sel = this.body && this.body.querySelector('[data-k="cam"]');
      if (sel) sel.value = 'custom';
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.saveParams();
      this.renderCalc();
      this.compute();
      this.refreshStats();
    }, live ? 300 : 0);
  }

  /** Vuelve a dibujar el panel conservando la posición de desplazamiento. */
  reopen() {
    const y = this.body ? this.body.scrollTop : 0;
    this.open();
    if (this.body) this.body.scrollTop = y;
  }

  calc() {
    const p = this.p;
    return photogrammetry({sensorW: +p.sensorW, sensorH: +p.sensorH, focal: +p.focal, imgW: +p.imgW, imgH: +p.imgH}, +p.altitude, +p.side / 100, +p.front / 100, !!p.longAcross);
  }

  renderCalc() {
    const el = this.body && this.body.querySelector('#plCalc');
    if (!el) return;
    const bad = CALC_KEYS.some((k) => this.invalid.has(k));
    const r = bad ? null : this.calc();
    if (!r || !isFinite(r.gsd) || r.gsd <= 0 || !(r.photoSpacing > 0) || !(r.lineSpacing > 0)) {
      el.innerHTML = `<p class="note warn">${esc(t('Revise los datos de la cámara: deben ser números mayores que 0.'))}</p>`;
      return;
    }
    const speed = Math.max(0.5, +this.p.speed);
    let extra = '';
    if (this.plan && this.p.mode !== 'grid') {
      const nPhotos = Math.ceil(this.plan.stats.linesLength / r.photoSpacing) + this.plan.stats.nLines;
      const flyMin = this.plan.stats.routeLength / speed / 60;
      extra = `<tr><th>${esc(t('Con el plan actual'))}</th><td>${esc(t('≈ {n} fotos y ≈ {time} de vuelo (sin contar el despegue ni los giros)', {n: fmtNum(nPhotos), time: fmtDuration(flyMin)}))}</td></tr>`;
    }
    el.innerHTML = `<table class="kv">
      <tr><th>${esc(t('Tamaño del píxel en el suelo (GSD)'))}</th><td><b>${fmtNum(r.gsd * 100, 2)} cm/px</b></td></tr>
      <tr><th>${esc(t('Terreno que cubre cada foto'))}</th><td>${fmtNum(r.footprintW, 1)} × ${fmtNum(r.footprintH, 1)} m</td></tr>
      <tr><th>${esc(t('Separación entre líneas'))}</th><td>${t('<b>{v} m</b> (traslape lateral {p} %)', {v: fmtNum(r.lineSpacing, 1), p: fmtIn(this.p.side)})}</td></tr>
      <tr><th>${esc(t('Distancia entre fotos'))}</th><td>${t('<b>{v} m</b> (traslape frontal {p} %) · una foto cada {s} s', {v: fmtNum(r.photoSpacing, 1), p: fmtIn(this.p.front), s: fmtNum(r.photoSpacing / speed, 1)})}</td></tr>
      ${extra}</table>`;
  }

  async onClick(e) {
    const a = e.target.closest('[data-a]');
    if (!a) return;
    const act = a.dataset.a;
    if (act === 'draw') return this.startDraw();
    if (act === 'res') {
      const sp = Number(a.dataset.sp);
      this.p.spacing = sp;
      if (a.dataset.iv !== '') this.p.interval = Number(a.dataset.iv);
      else if (this.p.square && this.p.mode === 'grid') this.p.interval = sp;
      this.saveParams();
      this.compute();
      return this.reopen();
    }
    if (act === 'wps') {
      const wl = this.ctx.waypoints.list;
      if (wl.length < 3) return;
      this.setArea(orderAroundCentroid(wl.map((w) => [w.lon, w.lat])), tn(wl.length, 'Desde {n} punto marcado', 'Desde {n} puntos marcados'));
      return this.open();
    }
    if (act === 'dirAuto' || act === 'dirManual' || act === 'rot90') {
      const current = this.p.azimuth === 'auto' ? (this.plan ? this.plan.stats.azimuth : 0) : Number(this.p.azimuth);
      if (act === 'dirAuto') this.p.azimuth = 'auto';
      else if (act === 'dirManual') {
        if (this.p.azimuth !== 'auto') return;
        this.p.azimuth = round1(current); // empieza con la dirección que ya tenía
      } else this.p.azimuth = round1((((current + 90) % 180) + 180) % 180);
      this.saveParams();
      this.compute();
      return this.reopen();
    }
    if (act === 'applyCam') {
      if (CALC_KEYS.some((k) => this.invalid.has(k))) return toast(t('Revise los datos de la cámara: deben ser números mayores que 0.'), 4000);
      const r = this.calc();
      if (!(r.lineSpacing > 0) || !(r.photoSpacing > 0)) return toast(t('Revise los datos de la cámara: deben ser números mayores que 0.'), 4000);
      this.p.spacing = Math.max(NUM.spacing.min, round1(r.lineSpacing));
      this.p.interval = Math.max(NUM.interval.min, round1(r.photoSpacing));
      if (this.p.spacing !== this.p.interval) this.p.square = false; // si no, el próximo cambio igualaría los dos valores
      this.saveParams();
      this.compute();
      const a1 = fmtIn(this.p.spacing), b1 = fmtIn(this.p.interval);
      if (this.p.mode === 'grid') toast(t('Puntos cada {a} × {b} m. Para un vuelo de dron suele convenir «Líneas en serpentina».', {a: a1, b: b1}), 6000);
      else if (this.p.mode === 'lines' && this.p.withPoints) toast(t('Líneas cada {a} m; puntos (fotos) cada {b} m.', {a: a1, b: b1}), 5000);
      else toast(t('Líneas cada {a} m. El dron toma una foto cada {b} m.', {a: a1, b: b1}), 5000);
      return this.reopen();
    }
    if (act === 'clear') {
      const ok = await dialog(t('¿Borrar el área y el plan?'), `<p>${esc(t('Las capas que ya guardó no se borran.'))}</p>`, [
        {label: t('Cancelar'), value: false},
        {label: t('Borrar'), value: true, danger: true},
      ]);
      if (!ok) return;
      this.clear();
      return this.reopen();
    }
    if (!this.plan) return;
    if (act === 'save' || act === 'follow') return this.saveAndMaybeFollow(act === 'follow');
    if (act === 'export') return this.exportDialog();
  }

  /** Guarda el plan como capas y, si se pide, empieza a seguirlo. */
  async saveAndMaybeFollow(follow) {
    if (this.saving || !this.canSave()) return; // evita guardar dos veces con un doble toque
    let how = 'line';
    if (follow) {
      if (this.p.mode === 'grid' && this.plan.points.length) how = 'points';
      else if (this.p.mode === 'lines' && this.plan.points.length) {
        how = await dialog(t('¿Cómo quiere seguir el plan?'), `<p>${esc(t('Puede caminar sobre las líneas o ir de un punto al siguiente.'))}</p>`, [
          {label: t('Cancelar'), value: null},
          {label: t('Ir de punto en punto'), value: 'points'},
          {label: t('Seguir las líneas'), value: 'line', primary: true},
        ]);
        if (!how || !this.plan) return;
      }
    }
    if (this.p.start === 'near') this.compute(); // con la posición más reciente
    if (!this.plan) return this.refreshStats();
    this.saving = true;
    this.refreshStats();
    const name = this.layerName();
    let saved = {};
    try {
      saved = (await this.ctx.savePlanLayers(name, this.linesGeoJSON(), this.plan.points.length ? this.pointsGeoJSON() : null)) || {};
    } finally {
      this.saving = false;
    }
    if (!saved.linesId) return this.refreshStats(); // no se guardó: se conserva el plan para reintentar
    if (follow) {
      closeSheet();
      if (how === 'points') this.ctx.nav.startPoints(this.plan.points.map((q) => ({ll: q.ll, name: q.name, line: q.line})), name, {layerId: saved.pointsId});
      else this.ctx.nav.startLine(this.plan.route, name, {layerId: saved.linesId});
      this.clear();
      return;
    }
    // Guardado: las capas nuevas ya muestran el plan, así que se quita la vista previa;
    // el área y el plan se conservan para exportarlo o ajustar y guardar otra versión.
    this.src.clear();
    this.savedNote = t('Guardado como capas: «{name}».', {name});
    return this.reopen();
  }

  /** Nombre de las capas guardadas: tipo, medida y fecha en el formato del idioma. */
  layerName() {
    const when = fmtDateTime(Date.now());
    const a = fmtIn(this.p.spacing), b = fmtIn(this.p.interval);
    if (this.p.mode === 'grid') return t('Cuadrícula {a} × {b} m · {when}', {a, b, when});
    if (this.p.mode === 'double') return t('Líneas cruzadas cada {a} m · {when}', {a, when});
    return t('Líneas cada {a} m · {when}', {a, when});
  }

  // ------------------------------------------------------------ salidas
  // Claves y códigos fijos (nombre, linea, tipo: ruta | area | linea, largo_m, area_m2, id) para que
  // la app y otros programas los lean en cualquier idioma; solo los nombres van traducidos.
  linesGeoJSON() {
    const r6 = (v) => Math.round(v * 1e8) / 1e8;
    const s = this.plan.stats;
    const feats = [
      {type: 'Feature', properties: {nombre: t('Ruta del plan'), tipo: 'ruta', largo_m: +s.routeLength.toFixed(1)}, geometry: {type: 'LineString', coordinates: this.plan.route.map((c) => [r6(c[0]), r6(c[1])])}},
      {type: 'Feature', properties: {nombre: t('Área del plan'), tipo: 'area', area_m2: +s.area.toFixed(1)}, geometry: {type: 'Polygon', coordinates: this.areaRings().map((r) => r.map((c) => [r6(c[0]), r6(c[1])]))}},
      ...this.plan.lines.map((l) => ({type: 'Feature', properties: {nombre: t('Línea {n}', {n: l.line}), linea: l.line, tipo: 'linea', largo_m: +l.length.toFixed(2)}, geometry: {type: 'LineString', coordinates: l.coords.map((c) => [r6(c[0]), r6(c[1])])}})),
    ];
    return JSON.stringify({type: 'FeatureCollection', name: 'plan_lineas', features: feats});
  }

  pointsGeoJSON() {
    const r6 = (v) => Math.round(v * 1e8) / 1e8;
    return JSON.stringify({
      type: 'FeatureCollection',
      name: 'plan_puntos',
      features: this.plan.points.map((p) => ({type: 'Feature', properties: {id: p.id, nombre: p.name, linea: p.line}, geometry: {type: 'Point', coordinates: [r6(p.ll[0]), r6(p.ll[1])]}})),
    });
  }

  async exportDialog() {
    const cr = this.ring && inCostaRica(this.ring[0][0], this.ring[0][1]);
    const opts = [
      ['geojson', 'GeoJSON', t('Líneas, ruta y puntos (WGS 84), para QGIS y otros programas de mapas.')],
      ['kml', 'KML', t('Todo el plan, para Google Earth.')],
      ['kmlarea', t('KML solo del área'), t('Para crear la misión de vuelo en DJI Pilot 2 o Pix4D.')],
      ['gpx', 'GPX', t('Ruta y puntos, para un GPS de mano.')],
      ['csv', t('CSV de puntos'), cr ? t('Una fila por punto: latitud, longitud, UTM y CRTM05.') : t('Una fila por punto: latitud, longitud y UTM.')],
      ['sputm', 'SingularPad · UTM WGS 84', t('Para la libreta RTK SingularPad: Nombre,N,E,Z,Código, sin encabezado.')],
    ];
    if (cr) {
      opts.push(['sp8908', 'SingularPad · CRTM05 CR-SIRGAS (EPSG:8908)', t('Costa Rica: sistema oficial actual.')]);
      opts.push(['sp5367', 'SingularPad · CRTM05 CR05 (EPSG:5367)', t('Costa Rica: sistema anterior.')]);
    }
    const optsHtml = opts.map(([v, name, hint], i) => this.optHtml('xf', v, i === 0, name, hint)).join('');
    const html = `<p>${esc(t('Elija el formato del archivo. Después elija dónde guardarlo.'))}</p>
      ${this.plan.points.length ? '' : `<p class="note info">${esc(t('Este plan no tiene puntos: en GPX y CSV van los dos extremos de cada línea (L1A, L1B…).'))}</p>`}
      <div class="pl-opts plan" role="radiogroup" aria-label="${esc(t('Formato'))}">${optsHtml}</div>`;
    const fmt = await dialog(
      t('Exportar el plan'),
      html,
      [
        {label: t('Cancelar'), value: null},
        {label: t('Exportar'), primary: true, value: (w) => (w.querySelector('input[name="pl-xf"]:checked') || {}).value || null},
      ],
      (w) => w.addEventListener('change', () => w.querySelectorAll('.pl-opt').forEach((o) => o.classList.toggle('on', o.querySelector('input').checked))),
    );
    if (!fmt || !this.plan) return;
    // Nombre de archivo neutro (códigos y fecha ISO): igual en todos los idiomas
    const base = `plan_${this.p.mode}_${this.p.spacing}m_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
    const pts = this.plan.points.length ? this.plan.points : this.plan.lines.flatMap((l) => [{name: `L${l.line}A`, line: l.line, ll: l.coords[0]}, {name: `L${l.line}B`, line: l.line, ll: l.coords[1]}]);
    if (fmt === 'geojson') {
      const lines = JSON.parse(this.linesGeoJSON());
      if (this.plan.points.length) lines.features.push(...JSON.parse(this.pointsGeoJSON()).features);
      return this.ctx.saveText(base + '.geojson', 'application/geo+json', JSON.stringify(lines));
    }
    if (fmt === 'kml' || fmt === 'kmlarea') return this.ctx.saveText(base + (fmt === 'kmlarea' ? '_area' : '') + '.kml', 'application/vnd.google-earth.kml+xml', this.toKML(fmt === 'kmlarea'));
    if (fmt === 'gpx') return this.ctx.saveText(base + '.gpx', 'application/gpx+xml', this.toGPX(pts));
    if (fmt === 'csv') return this.ctx.saveText(base + '.csv', 'text/csv', this.toCSV(pts));
    const code = fmt === 'sp8908' ? 'EPSG:8908' : fmt === 'sp5367' ? 'EPSG:5367' : this.ctx.utmCode(this.ring[0]);
    return this.ctx.saveText(`${base}_SingularPad_${code.replace(':', '')}.csv`, 'text/csv', this.toSingularPad(pts, code));
  }

  toKML(areaOnly) {
    const c = (ll) => `${ll[0].toFixed(8)},${ll[1].toFixed(8)},0`;
    const [outer, ...inner] = this.areaRings();
    const area = `<Placemark><name>${esc(t('Área del plan'))}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${outer.map(c).join(' ')}</coordinates></LinearRing></outerBoundaryIs>${inner.map((h) => `<innerBoundaryIs><LinearRing><coordinates>${h.map(c).join(' ')}</coordinates></LinearRing></innerBoundaryIs>`).join('')}</Polygon></Placemark>`;
    const parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>', `<name>${esc(this.layerName())}</name>`, area];
    if (!areaOnly) {
      parts.push(`<Placemark><name>${esc(t('Ruta del plan'))}</name><LineString><tessellate>1</tessellate><coordinates>${this.plan.route.map(c).join(' ')}</coordinates></LineString></Placemark>`);
      parts.push(`<Folder><name>${esc(t('Líneas'))}</name>` + this.plan.lines.map((l) => `<Placemark><name>${esc(t('Línea {n}', {n: l.line}))}</name><LineString><coordinates>${l.coords.map(c).join(' ')}</coordinates></LineString></Placemark>`).join('') + '</Folder>');
      if (this.plan.points.length) parts.push(`<Folder><name>${esc(t('Puntos'))}</name>` + this.plan.points.map((p) => `<Placemark><name>${esc(p.name)}</name><description>L${p.line}</description><Point><coordinates>${c(p.ll)}</coordinates></Point></Placemark>`).join('') + '</Folder>');
    }
    parts.push('</Document></kml>');
    return parts.join('\n');
  }

  toGPX(pts) {
    const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<gpx version="1.1" creator="Mapa de Campo (Android)" xmlns="http://www.topografix.com/GPX/1/1">'];
    for (const p of pts) out.push(`  <wpt lat="${p.ll[1].toFixed(8)}" lon="${p.ll[0].toFixed(8)}"><name>${esc(p.name)}</name><desc>${esc(t('Línea {n}', {n: p.line}))}</desc></wpt>`);
    out.push(`  <rte><name>${esc(t('Ruta del plan'))}</name>`);
    for (const ll of this.plan.route) out.push(`    <rtept lat="${ll[1].toFixed(8)}" lon="${ll[0].toFixed(8)}"/>`);
    out.push('  </rte>', '</gpx>');
    return out.join('\n');
  }

  toCSV(pts) {
    const utm = this.ctx.utmCode(this.ring[0]);
    const cr = inCostaRica(this.ring[0][0], this.ring[0][1]);
    const rows = [['nombre', 'linea', 'lat_WGS84', 'lon_WGS84', `E_${utm.replace(':', '')}`, `N_${utm.replace(':', '')}`, ...(cr ? ['E_CRTM05_EPSG8908', 'N_CRTM05_EPSG8908'] : [])].join(',')];
    for (const p of pts) {
      const u = fromWgs84(utm, p.ll);
      const c = cr ? fromWgs84('EPSG:8908', p.ll) : null;
      rows.push([p.name, p.line, p.ll[1].toFixed(8), p.ll[0].toFixed(8), u[0].toFixed(3), u[1].toFixed(3), ...(c ? [c[0].toFixed(3), c[1].toFixed(3)] : [])].join(','));
    }
    return '﻿' + rows.join('\r\n');
  }

  toSingularPad(pts, code) {
    return pts.map((p) => {
      const [e, n] = fromWgs84(code, p.ll);
      return `${p.name},${n.toFixed(3)},${e.toFixed(3)},0.000,L${p.line}`;
    }).join('\n') + '\n';
  }
}
