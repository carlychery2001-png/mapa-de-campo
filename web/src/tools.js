// Herramientas: medir distancias y áreas, grabar un recorrido (track), marcar puntos y
// promediar posiciones.
//
// Las medidas se calculan sobre el elipsoide WGS 84 en un plano Transverso de
// Mercator local (k0 = 1) centrado en la geometría medida: a escala de finca
// la distorsión de distancias y áreas es inferior a 1 ppm. (La fórmula esférica
// de ol/sphere puede errar ~0,5 % en dirección norte-sur a 10° de latitud.)

import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import MultiLineString from 'ol/geom/MultiLineString.js';
import Draw from 'ol/interaction/Draw.js';
import {Style, Stroke, Fill, Circle as CircleStyle, Text} from 'ol/style.js';
import {fromLL, toLL} from './formats.js';
import {localPlane} from './crs.js';
import {fmtDist, fmtArea, inverse, cardinal} from './geodesy.js';
import {settings, loadTrack, saveTrack, loadWaypoints, saveWaypoints} from './store.js';
import {$, toast} from './ui.js';
import {t, tn, fmtNum, fmtDateTime, variants} from './i18n.js';
import {call, callJSON, on, HAS_NATIVE} from './native.js';

/** Longitud (m) de una lista de [lon,lat] en un plano local. */
export function lengthLL(ll) {
  if (ll.length < 2) return 0;
  const c = centroid(ll);
  const pl = localPlane(c[0], c[1]);
  let L = 0, prev = pl.fwd(ll[0]);
  for (let i = 1; i < ll.length; i++) {
    const p = pl.fwd(ll[i]);
    L += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return L;
}

/** Área (m²) de un anillo [lon,lat] (fórmula del polígono de Gauss en el plano local). */
export function areaLL(ring) {
  if (ring.length < 3) return 0;
  const c = centroid(ring);
  const pl = localPlane(c[0], c[1]);
  const p = ring.map((q) => pl.fwd(q));
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

function centroid(ll) {
  let x = 0, y = 0;
  for (const p of ll) { x += p[0]; y += p[1]; }
  return [x / ll.length, y / ll.length];
}

// ---------------------------------------------------------------------------
// Medir: la barra de index.html (#measureBar) tiene el texto #measureTxt y tres botones que
// main.js conecta: #mUndo → undo(), #mClose → stop(), #mDone → finish(). Esta clase pone sus
// textos y los muestra u oculta según el paso: midiendo («Deshacer», «Cancelar», «Listo») o con
// el resultado a la vista («Cerrar», «Medir otra»). No hace falta tocar dos veces: «Listo»
// termina la medida (también funciona tocar dos veces el último punto o el primero del área).

const MEASURE_STYLE = [
  new Style({stroke: new Stroke({color: '#000000', width: 5})}),
  new Style({stroke: new Stroke({color: '#ffeb3b', width: 3, lineDash: [10, 6]}), fill: new Fill({color: 'rgba(255,235,59,0.18)'}), image: new CircleStyle({radius: 5, fill: new Fill({color: '#ffeb3b'}), stroke: new Stroke({color: '#000', width: 1.5})})}),
];
const SKETCH_STYLE = [
  new Style({stroke: new Stroke({color: '#000000', width: 5})}),
  new Style({stroke: new Stroke({color: '#ffeb3b', width: 3}), fill: new Fill({color: 'rgba(255,235,59,0.2)'}), image: new CircleStyle({radius: 7, fill: new Fill({color: '#ffeb3b'}), stroke: new Stroke({color: '#000', width: 2})})}),
];

export class Measure {
  constructor(map) {
    this.map = map;
    this.src = new VectorSource();
    this.layer = new VectorLayer({source: this.src, zIndex: 850, style: MEASURE_STYLE});
    this.layer.set('system', true);
    map.addLayer(this.layer);
    this.active = false;   // la barra de medir está a la vista
    this.finished = false; // hay un resultado terminado a la vista
    this.result = '';      // texto del último resultado (para copiarlo)
    // Respaldo mientras main.js no conecte #mDone: si ya tiene onclick, no hace nada.
    const done = typeof document !== 'undefined' && document.getElementById('mDone');
    if (done) done.addEventListener('click', () => { if (!done.onclick && this.active) this.finish(); });
  }

  /** Empieza a medir: type = 'LineString' (distancia) o 'Polygon' (área). */
  start(type = 'LineString') {
    this.stop();
    this.active = true;
    this.finished = false;
    this.result = '';
    this.type = type;
    this.src.clear();
    this.draw = new Draw({source: this.src, type, style: SKETCH_STYLE});
    this.draw.on('drawstart', (e) => {
      this.src.clear();
      this.sketch = e.feature;
      e.feature.getGeometry().on('change', (ev) => this.show(ev.target));
    });
    this.draw.on('drawabort', () => {
      this.sketch = null;
      this.hint();
    });
    this.draw.on('drawend', (e) => {
      this.sketch = null;
      this.done(e.feature.getGeometry());
    });
    this.map.addInteraction(this.draw);
    document.body.classList.add('measuring');
    $('#measureBar').hidden = false;
    this.setBar('drawing');
    this.hint();
  }

  /** Texto inicial: qué tocar. */
  hint() {
    if (!this.active || this.finished) return;
    $('#measureTxt').textContent = this.type === 'Polygon'
      ? t('Toque cada esquina del área. Toque «Listo» al terminar.')
      : t('Toque el mapa en cada punto de la línea. Toque «Listo» al terminar.');
  }

  /** Puntos que ya tocó el usuario (sin el punto que sigue al dedo o al ratón). */
  tappedCount(geom) {
    if (!geom) return 0;
    if (geom.getType() === 'Polygon') {
      const ring = geom.getCoordinates()[0] || [];
      // [...tocados, puntero, cierre]; con la primera esquina el anillo es [p0, p0]
      return ring.length === 2 ? 1 : Math.max(0, ring.length - 2);
    }
    return Math.max(0, geom.getCoordinates().length - 1); // [...tocados, puntero]
  }

  /** Texto de la medida (en curso o terminada). */
  show(geom, final = false) {
    if (!this.active) return;
    const isPoly = geom.getType() === 'Polygon';
    const coords = isPoly ? geom.getCoordinates()[0] || [] : geom.getCoordinates();
    const ll = coords.map(toLL);
    const tapped = final ? (isPoly ? Math.max(0, ll.length - 1) : ll.length) : this.tappedCount(geom);
    let txt;
    if (isPoly) {
      const ring = ll.slice(0, -1);
      if (tapped < 3) txt = tn(tapped, '{n} esquina marcada. Toque al menos 3.', '{n} esquinas marcadas. Toque al menos 3.');
      else {
        const p = {a: fmtArea(areaLL(ring)), p: fmtDist(lengthLL([...ring, ring[0]]))};
        txt = final ? t('Resultado: área {a} · perímetro {p}', p) : t('Área: {a} · perímetro {p}', p);
      }
    } else if (tapped < 2) {
      txt = t('Toque el siguiente punto de la línea.');
    } else {
      const d = fmtDist(lengthLL(ll));
      if (tapped === 2) {
        const az = inverse(ll[0], ll[1]).azimuth1;
        const p = {d, deg: fmtNum(Math.round(az) % 360, 0), dir: cardinal(az)};
        txt = final ? t('Resultado: {d} · rumbo {deg}° {dir}', p) : t('Distancia: {d} · rumbo {deg}° {dir}', p);
      } else {
        txt = final
          ? tn(tapped, 'Resultado: {d} · {n} punto', 'Resultado: {d} · {n} puntos', {d})
          : tn(tapped, 'Distancia: {d} · {n} punto', 'Distancia: {d} · {n} puntos', {d});
      }
    }
    if (final) this.result = txt;
    $('#measureTxt').textContent = txt;
    const live = document.getElementById('measureLive');
    if (live && typeof txt === 'string' && (final || tapped !== this.lastAnnounced)) {
      this.lastAnnounced = tapped;
      live.textContent = txt;
    }
  }

  /** La medida terminó (con «Listo» o tocando dos veces): deja la figura y el resultado. */
  done(geom) {
    this.finished = true;
    // Se quita la herramienta de dibujo después del evento: el doble toque que cierra la figura
    // no debe acercar el mapa ni empezar otra medida.
    const draw = this.draw;
    this.draw = null;
    setTimeout(() => draw && this.map.removeInteraction(draw), 0);
    this.show(geom, true);
    this.setBar('finished');
  }

  /**
   * Botón «Listo»: termina la medida y deja a la vista la figura y su valor. Con un resultado ya
   * a la vista («Medir otra»), empieza otra medida del mismo tipo.
   */
  finish() {
    if (!this.active) return;
    if (this.finished) {
      this.start(this.type);
      return;
    }
    const geom = this.sketch && this.sketch.getGeometry();
    const min = this.type === 'Polygon' ? 3 : 2;
    if (!this.draw || this.tappedCount(geom) < min) {
      toast(this.type === 'Polygon' ? t('Toque al menos 3 esquinas del área.') : t('Toque al menos 2 puntos en el mapa.'));
      return;
    }
    this.draw.finishDrawing();
  }

  /** Quita el último punto tocado. */
  undo() {
    if (this.draw && !this.finished) this.draw.removeLastPoint();
  }

  /** Cierra la barra y borra la medida. */
  stop() {
    if (this.draw) this.map.removeInteraction(this.draw);
    this.draw = null;
    this.sketch = null;
    const wasActive = this.active;
    this.active = false;
    this.finished = false;
    this.src.clear();
    document.body.classList.remove('measuring');
    $('#measureBar').hidden = true;
    // La barra también sirve para dibujar el área del planificador: se deja como estaba
    if (wasActive) this.setBar('reset');
  }

  /** Textos y botones de la barra: 'drawing' | 'finished' | 'reset'. */
  setBar(state) {
    const undo = $('#mUndo'), close = $('#mClose'), done = $('#mDone');
    if (!undo || !close || !done) return;
    const fin = state === 'finished';
    // data-i18n se actualiza también, por si la página vuelve a traducir los textos fijos
    const label = (el, key, text) => {
      el.dataset.i18n = key;
      el.textContent = text;
    };
    undo.hidden = fin;
    label(undo, 'Deshacer', t('Deshacer'));
    if (fin) {
      label(close, 'Cerrar', t('Cerrar'));
      label(done, 'Medir otra', t('Medir otra'));
    } else {
      label(close, 'Cancelar', t('Cancelar'));
      label(done, 'Listo', t('Listo'));
    }
  }
}

// ---------------------------------------------------------------------------
// Recorrido (track): en Android lo graba un servicio en primer plano (sigue con la pantalla
// apagada); en modo web se graba en la página. Al continuar una grabación detenida empieza un
// tramo nuevo: data.breaks guarda el índice del primer punto de cada tramo nuevo, para no unir
// con una recta dos tramos grabados en momentos distintos.
export class Track {
  constructor(map, gps) {
    this.map = map;
    this.gps = gps;
    this.data = loadTrack();
    if (!Array.isArray(this.data.breaks)) this.data.breaks = [];
    this.src = new VectorSource();
    this.line = new Feature();
    this.line.setStyle([new Style({stroke: new Stroke({color: '#ffffff', width: 6})}), new Style({stroke: new Stroke({color: '#d50000', width: 3})})]);
    this.src.addFeature(this.line);
    this.layer = new VectorLayer({source: this.src, zIndex: 700});
    this.layer.set('system', true);
    map.addLayer(this.layer);
    this.listeners = [];
    this.waitKey = 'ok';
    if (HAS_NATIVE) {
      const st = callJSON('trackStatus');
      if (st) {
        this.data.recording = !!st.recording;
        if (st.recording) this.pullNative();
      }
      on('onTrackPoint', () => this.pullNative());
    }
    gps.onChange((type) => {
      // En Android graba el servicio nativo (también con la pantalla apagada).
      if (type === 'fix' && this.data.recording && !HAS_NATIVE) this.addFix(gps.fix);
      // Avisa cuando cambia el estado de espera (GPS impreciso o sin señal) para que se vea en pantalla
      if ((type === 'fix' || type === 'stale' || type === 'permission') && this.data.recording) {
        const s = this.waitState();
        const key = s.noSignal ? 'nosignal' : s.waitAcc !== null ? 'wait' : 'ok';
        if (key !== this.waitKey) {
          this.waitKey = key;
          this.emit();
        }
      }
    });
    this.redraw();
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.listeners.forEach((f) => f(this));
  }

  get recording() {
    return this.data.recording;
  }

  /** Nombre del recorrido nuevo, con la fecha y la hora en el formato del idioma. */
  static defaultName(ms = Date.now()) {
    return t('Recorrido {date}', {date: fmtDateTime(ms)});
  }

  start() {
    if (HAS_NATIVE) this.pullNative();
    const n = this.data.points.length;
    if (!n) this.data.started = Date.now();
    else if (this.data.breaks[this.data.breaks.length - 1] !== n) this.data.breaks.push(n); // continuar: tramo nuevo
    this.data.recording = true;
    this.data.name = this.data.name || Track.defaultName();
    if (HAS_NATIVE) call('startTrack', settings.trackMinDist, settings.trackMaxAcc);
    saveTrack(this.data);
    this.waitKey = 'ok';
    this.emit();
  }

  stop() {
    this.data.recording = false;
    if (HAS_NATIVE) {
      this.pullNative();
      call('stopTrack');
    }
    saveTrack(this.data);
    this.emit();
  }

  clear() {
    this.data = {points: [], breaks: [], recording: false};
    if (HAS_NATIVE) call('clearTrack');
    saveTrack(this.data);
    this.redraw();
    this.emit();
  }

  pullNative() {
    const pts = callJSON('getTrack', this.data.points.length);
    if (pts && pts.length) {
      this.data.points.push(...pts);
      saveTrack(this.data);
      this.redraw();
      this.emit();
    }
  }

  addFix(f) {
    if (!f || f.acc > settings.trackMaxAcc) return;
    const last = this.data.points[this.data.points.length - 1];
    if (last && inverse([last.lon, last.lat], [f.lon, f.lat]).distance < Math.max(settings.trackMinDist, 0.5)) return;
    this.data.points.push({lat: f.lat, lon: f.lon, alt: f.alt, msl: f.msl, acc: f.acc, time: f.time || Date.now()});
    if (this.data.points.length % 5 === 0) saveTrack(this.data);
    this.redraw();
    this.emit();
  }

  /** Puntos separados en tramos (cada vez que se continúa la grabación empieza uno). */
  segments() {
    const p = this.data.points;
    const cuts = [0, ...this.data.breaks.filter((i) => i > 0 && i < p.length), p.length];
    const out = [];
    for (let k = 0; k + 1 < cuts.length; k++) if (cuts[k + 1] > cuts[k]) out.push(p.slice(cuts[k], cuts[k + 1]));
    return out;
  }

  redraw() {
    const segs = this.segments().filter((s) => s.length > 1).map((s) => s.map((q) => fromLL([q.lon, q.lat])));
    this.line.setGeometry(segs.length ? new MultiLineString(segs) : null);
  }

  /** Mientras graba: ¿espera un GPS más preciso (waitAcc = ±m) o no hay señal (noSignal)? */
  waitState() {
    const g = this.gps;
    if (!this.data.recording || !g) return {waitAcc: null, noSignal: false};
    if (!g.fix || g.isStale()) return {waitAcc: null, noSignal: true};
    return {waitAcc: g.fix.acc > settings.trackMaxAcc ? g.fix.acc : null, noSignal: false};
  }

  /**
   * Resumen: n puntos, len metros y dur milisegundos (sin contar las pausas), segments tramos,
   * y mientras graba waitAcc (precisión actual si es peor que el límite de Ajustes: esas lecturas
   * no se guardan) y noSignal (sin lecturas del GPS).
   */
  stats() {
    const segs = this.segments();
    let len = 0, dur = 0;
    for (const s of segs) {
      len += lengthLL(s.map((q) => [q.lon, q.lat]));
      if (s.length > 1) dur += s[s.length - 1].time - s[0].time;
    }
    return {n: this.data.points.length, len, dur, segments: segs.length, ...this.waitState()};
  }
}

// ---------------------------------------------------------------------------
export class Waypoints {
  constructor(map) {
    this.map = map;
    this.list = loadWaypoints();
    this.src = new VectorSource();
    this.layer = new VectorLayer({source: this.src, zIndex: 750});
    this.layer.set('system', true);
    this.layer.set('waypoints', true);
    map.addLayer(this.layer);
    this.redraw();
  }

  /**
   * Nombre para el próximo punto: «Punto N» en el idioma de la interfaz, con el número siguiente
   * al más alto que ya existe (borrar un punto no hace que se repita un nombre).
   */
  nextName() {
    // Reconoce «Punto 7», «Point 7» o «Ponto 7»: cambiar de idioma no reinicia la numeración
    const quote = (x) => String(x || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const res = variants('Punto {n}').map((v) => {
      const [pre, post] = v.split('{n}');
      return new RegExp(`^${quote(pre)}(\\d+)${quote(post)}$`);
    });
    let max = 0;
    for (const w of this.list) {
      const name = String(w.name || '').trim();
      for (const re of res) {
        const m = re.exec(name);
        if (m) max = Math.max(max, Number(m[1]));
      }
    }
    return t('Punto {n}', {n: Math.max(max, 0) + 1});
  }

  add(w) {
    const now = Date.now();
    const id = Math.max(now, ...this.list.map((x) => (Number(x.id) || 0) + 1)); // único aunque se marquen dos en el mismo milisegundo
    const wp = Object.assign({id, time: now}, w);
    if (!wp.name || !String(wp.name).trim()) wp.name = this.nextName();
    this.list.push(wp);
    saveWaypoints(this.list);
    this.redraw();
    return wp;
  }

  remove(id) {
    this.list = this.list.filter((w) => w.id !== id);
    saveWaypoints(this.list);
    this.redraw();
  }

  rename(id, name) {
    const w = this.list.find((x) => x.id === id);
    if (w) w.name = name;
    saveWaypoints(this.list);
    this.redraw();
  }

  redraw() {
    this.src.clear();
    for (const w of this.list) {
      const f = new Feature(new Point(fromLL([w.lon, w.lat])));
      f.set('name', w.name);
      f.set('waypoint', w.id);
      f.setStyle(
        new Style({
          image: new CircleStyle({radius: 8, fill: new Fill({color: '#ff6d00'}), stroke: new Stroke({color: '#fff', width: 3})}),
          text: new Text({text: String(w.name ?? ''), offsetY: -18, font: '700 13px system-ui', fill: new Fill({color: '#000'}), stroke: new Stroke({color: '#fff', width: 4})}),
        }),
      );
      this.src.addFeature(f);
    }
  }
}

// ---------------------------------------------------------------------------
/** Dispersión (m, raíz del error cuadrático medio) de lecturas alrededor de su media ponderada. */
function spreadOf(fixes) {
  if (!fixes.length) return 0;
  const pl = localPlane(fixes[0].lon, fixes[0].lat);
  let sw = 0, sx = 0, sy = 0;
  const pts = fixes.map((f) => ({xy: pl.fwd([f.lon, f.lat]), w: 1 / Math.max(0.5, f.acc) ** 2}));
  for (const p of pts) { sw += p.w; sx += p.w * p.xy[0]; sy += p.w * p.xy[1]; }
  const mx = sx / sw, my = sy / sw;
  return Math.sqrt(pts.reduce((s, p) => s + (p.xy[0] - mx) ** 2 + (p.xy[1] - my) ** 2, 0) / pts.length);
}

/**
 * Promedia lecturas durante `seconds` (media ponderada por 1/σ², con σ = la
 * precisión al 68 % que informa Android). Devuelve la posición media y la
 * dispersión de las lecturas en metros, o null si no llegó ninguna lectura o se canceló.
 * @param {object} gps instancia de Gps
 * @param {number} seconds duración (s)
 * @param {(elapsed:number, n:number, spread:number) => void} [onTick] cada 250 ms: segundos, lecturas
 *   y cuánto variaron hasta ahora (m), para mostrarlo mientras se promedia
 * @param {AbortSignal} [signal] para cancelar (el botón «Cancelar»)
 */
export function averagePosition(gps, seconds, onTick, signal) {
  return new Promise((resolve) => {
    const fixes = [];
    const start = Date.now();
    let lastTime = 0;
    let timer = null;
    const handler = (type) => {
      if (type !== 'fix') return;
      const f = gps.fix;
      if (!f || f.time === lastTime) return;
      lastTime = f.time;
      fixes.push(f);
    };
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearInterval(timer);
      timer = null;
      if (typeof gps.offChange === 'function') gps.offChange(handler);
      else if (gps.listeners.includes(handler)) gps.listeners.splice(gps.listeners.indexOf(handler), 1);
      resolve(value);
    };
    gps.onChange(handler);
    if (signal) {
      if (signal.aborted) return finish(null);
      signal.addEventListener('abort', () => finish(null), {once: true});
    }
    timer = setInterval(() => {
      const el = Date.now() - start;
      if (onTick) onTick(el / 1000, fixes.length, spreadOf(fixes));
      if (el >= seconds * 1000) {
        if (!fixes.length) return finish(null);
        const pl = localPlane(fixes[0].lon, fixes[0].lat);
        let sw = 0, sx = 0, sy = 0, sz = 0, swz = 0;
        const pts = fixes.map((f) => ({xy: pl.fwd([f.lon, f.lat]), w: 1 / Math.max(0.5, f.acc) ** 2, f}));
        for (const p of pts) {
          sw += p.w; sx += p.w * p.xy[0]; sy += p.w * p.xy[1];
          if (isFinite(p.f.alt) && p.f.alt !== null) { sz += p.w * p.f.alt; swz += p.w; }
        }
        const mx = sx / sw, my = sy / sw;
        const ll = pl.inv([mx, my]);
        // Los errores GNSS están correlacionados en el tiempo (multitrayecto,
        // ionosfera), así que promediar un minuto reduce el ruido pero no
        // garantiza más exactitud: se informa la precisión media de las
        // lecturas, sin dividir por √n, y la dispersión observada aparte.
        const meanAcc = pts.reduce((s, p) => s + p.f.acc, 0) / pts.length;
        finish({lon: ll[0], lat: ll[1], alt: swz ? sz / swz : null, acc: meanAcc, spread: spreadOf(fixes), n: pts.length});
      }
    }, 250);
  });
}
