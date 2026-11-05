// Posición GNSS: lecturas del GPS (nativas o del navegador), dibujo de la
// posición con su círculo de precisión y orientación (brújula o rumbo).
//
// Android: Location.getAccuracy() es el radio horizontal al 68 % de confianza;
// getAltitude() es altura sobre el elipsoide WGS 84 (developer.android.com,
// android.location.Location). El círculo se dibuja como un polígono geodésico
// (ol/geom/Polygon circular) para que el radio sea correcto sobre el terreno.
//
// Códigos neutros (no se traducen; la interfaz los convierte en texto al mostrarlos):
// - fix.provider: 'gnss' (satélites), 'network' (red móvil o wifi, aproximada), 'sim' (simulación),
//   'browser' (ubicación del navegador).
// - displayHeading().src: 'motion' (rumbo de marcha del GNSS) o 'compass' (brújula del teléfono).
// - permission: 'granted' | 'approximate' | 'denied' | 'unknown' (Android) o 'web' (navegador).
// - quality(): 'good' | 'fair' | 'poor' | 'stale' | 'none'.

import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import {circular} from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import {Style, Fill, Stroke, Circle as CircleStyle, RegularShape} from 'ol/style.js';
import {fromLL} from './formats.js';
import {fmtDist} from './geodesy.js';
import {t, fmtNum} from './i18n.js';
import {on, call, HAS_NATIVE} from './native.js';

const STALE_MS = 4000;
// Colores de la posición sobre el mapa (se ven sobre ortofotos claras y oscuras)
const DOT = '#1a73e8';
const DOT_SIM = '#7c4dff';
const DOT_STALE = '#8a8f94';

/** Convierte el proveedor que informa Android o el navegador en un código neutro. */
export function normProvider(p) {
  const s = String(p || '').toLowerCase();
  if (s === 'sim' || s === 'simulation') return 'sim';
  if (s === 'browser') return 'browser';
  if (s === 'gnss' || s === 'gps') return 'gnss';
  if (/red|network|wifi|fused|aprox/.test(s)) return 'network';
  return s || 'gnss';
}

/** Nombre del proveedor de la posición para mostrarlo a una persona. */
export function providerLabel(code) {
  switch (normProvider(code)) {
    case 'gnss': return t('Satélites (GNSS)');
    case 'network': return t('Red móvil o wifi (aproximada)');
    case 'sim': return t('Simulación');
    case 'browser': return t('Ubicación del navegador');
    default: return String(code);
  }
}

export class Gps {
  constructor(map) {
    this.map = map;
    this.fix = null;          // última lectura
    this.gnss = null;         // estado de satélites
    this.heading = null;      // brújula (grados verdaderos)
    this.listeners = [];
    this.running = false;
    this.sim = null;
    this.permission = HAS_NATIVE ? 'unknown' : 'web';
    this.accFeature = new Feature();
    this.dotFeature = new Feature();
    this.layer = new VectorLayer({source: new VectorSource({features: [this.accFeature, this.dotFeature]}), zIndex: 900, updateWhileAnimating: true, updateWhileInteracting: true});
    this.layer.set('system', true);
    map.addLayer(this.layer);

    on('onLocation', (j) => this.handleFix(typeof j === 'string' ? JSON.parse(j) : j));
    on('onGnss', (j) => {
      this.gnss = typeof j === 'string' ? JSON.parse(j) : j;
      this.emit('gnss');
    });
    on('onHeading', (deg, acc, decl) => {
      const prev = this.heading;
      this.heading = {deg, acc, decl, time: Date.now()};
      // Redibuja la flecha como mucho 4 veces por segundo y solo si giró ≥ 2°
      if (!prev || Date.now() - (this.lastHeadingDraw || 0) > 250) {
        const d = prev ? Math.abs(((deg - (this.drawnHeading ?? -999) + 540) % 360) - 180) : 999;
        if (d >= 2) {
          this.drawnHeading = deg;
          this.lastHeadingDraw = Date.now();
          this.drawDot();
          this.emit('heading');
        }
      }
    });
    on('onLocationPermission', (state) => {
      this.permission = state; // granted | approximate | denied
      this.emit('permission');
    });
    on('onLocationProvider', (enabled) => {
      this.providerEnabled = !!enabled;
      this.emit('permission');
    });
    setInterval(() => {
      if (this.fix && this.isStale()) {
        this.drawDot();
        this.emit('stale');
      }
    }, 2000);
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  /** Deja de avisar a `fn` (la función que se pasó a onChange). */
  offChange(fn) {
    const i = this.listeners.indexOf(fn);
    if (i >= 0) this.listeners.splice(i, 1);
  }

  emit(type) {
    for (const fn of this.listeners) fn(type, this);
  }

  start() {
    this.running = true;
    if (this.sim) return;
    if (HAS_NATIVE) {
      call('startLocation');
    } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
      this.watchId = navigator.geolocation.watchPosition(
        (p) =>
          this.handleFix({
            lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy,
            alt: p.coords.altitude, altAcc: p.coords.altitudeAccuracy, speed: p.coords.speed,
            course: p.coords.heading, time: p.timestamp, provider: 'browser',
          }),
        (e) => {
          this.permission = e.code === 1 ? 'denied' : this.permission;
          this.emit('permission');
        },
        {enableHighAccuracy: true, maximumAge: 0, timeout: 30000},
      );
    }
  }

  stop() {
    this.running = false;
    if (HAS_NATIVE) call('stopLocation');
    else if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
  }

  isStale() {
    return !this.fix || Date.now() - this.fix.receivedAt > STALE_MS;
  }

  /** Segundos desde la última lectura (Infinity si no hay ninguna). */
  ageSeconds() {
    return this.fix ? (Date.now() - this.fix.receivedAt) / 1000 : Infinity;
  }

  handleFix(f) {
    const provider = normProvider(f.provider);
    if (this.sim && provider !== 'sim') return;
    if (!isFinite(f.lat) || !isFinite(f.lon)) return;
    f.provider = provider;
    f.receivedAt = Date.now();
    this.fix = f;
    const ll = [f.lon, f.lat];
    const acc = Math.max(0.5, Math.min(f.acc || 0, 5000));
    const circle = circular(ll, acc, 64).transform('EPSG:4326', 'EPSG:3857');
    this.accFeature.setGeometry(circle);
    this.dotFeature.setGeometry(new Point(fromLL(ll)));
    this.drawDot();
    this.emit('fix');
  }

  /**
   * ¿Sirve la posición actual para guiar o para guardar un punto?
   * @param {{maxAge?: number, maxAcc?: number}} [opts] antigüedad máxima (ms) y precisión mínima (m)
   * @returns {{ok: boolean, code: string, acc: number|null, age: number}}
   *   code: 'ok' | 'denied' (sin permiso) | 'off' (ubicación del teléfono apagada) |
   *   'approximate' (solo ubicación aproximada) | 'none' (todavía sin posición) |
   *   'stale' (sin lecturas nuevas) | 'poor' (precisión peor que maxAcc)
   */
  usability({maxAge = 3000, maxAcc = 50} = {}) {
    const f = this.fix;
    const acc = f && isFinite(f.acc) ? f.acc : null;
    const age = f ? Date.now() - f.receivedAt : Infinity;
    const res = (code) => ({ok: code === 'ok', code, acc, age});
    if (!this.sim) {
      if (this.permission === 'denied') return res('denied');
      if (this.providerEnabled === false) return res('off');
      if (this.permission === 'approximate') return res('approximate');
    }
    if (!f) return res('none');
    if (age > maxAge) return res('stale');
    if (acc === null || acc > maxAcc) return res('poor');
    return res('ok');
  }

  /**
   * Explicación de por qué la posición no sirve, con lo que hay que hacer, o null si sirve.
   * Mismos parámetros que usability().
   */
  problem(opts) {
    const u = this.usability(opts);
    if (u.ok) return null;
    let text;
    switch (u.code) {
      case 'denied': text = t('La app no tiene permiso de ubicación. Actívelo en los ajustes de la app.'); break;
      case 'off': text = t('La ubicación del teléfono está apagada. Actívela en los ajustes rápidos.'); break;
      case 'approximate': text = t('Solo hay ubicación aproximada. Active «Ubicación precisa» para esta app.'); break;
      case 'none': text = t('Todavía no hay señal GPS. Salga a cielo abierto y espere un momento.'); break;
      case 'stale':
        text = u.age < 120000
          ? t('Sin lecturas del GPS desde hace {s} s. Salga a cielo abierto y espere.', {s: fmtNum(u.age / 1000, 0)})
          : t('Sin lecturas del GPS desde hace {m} min. Salga a cielo abierto y espere.', {m: fmtNum(u.age / 60000, 0)});
        break;
      default: text = t('GPS muy impreciso (±{acc}). Salga a cielo abierto y espere.', {acc: fmtDist(u.acc)});
    }
    return {...u, text};
  }

  /**
   * Rumbo a mostrar: rumbo de marcha del GNSS si se camina, si no la brújula.
   * @returns {{deg: number, src: 'motion'|'compass', acc?: number, uncalibrated?: boolean}|null}
   *   uncalibrated: la brújula informa precisión «no fiable» (Android SENSOR_STATUS_UNRELIABLE).
   */
  displayHeading() {
    const f = this.fix;
    // Rumbo de marcha del GNSS solo si se camina (≥ 0,8 m/s) y su incertidumbre es ≤ 20°
    if (f && f.speed >= 0.8 && isFinite(f.course) && f.course !== null && !(f.courseAcc > 20)) return {deg: f.course, src: 'motion'};
    if (this.heading && Date.now() - this.heading.time < 3000) {
      const acc = this.heading.acc;
      return {deg: this.heading.deg, src: 'compass', acc, uncalibrated: acc === 0, low: acc === 1};
    }
    return null;
  }

  drawDot() {
    const stale = this.isStale();
    const color = stale ? DOT_STALE : this.sim ? DOT_SIM : DOT;
    const h = this.displayHeading();
    const styles = [];
    if (h && !stale) {
      styles.push(
        new Style({
          image: new RegularShape({
            points: 3, radius: 9, displacement: [0, 15], rotation: (h.deg * Math.PI) / 180, rotateWithView: true,
            fill: new Fill({color}), stroke: new Stroke({color: '#fff', width: 2}),
          }),
        }),
      );
    }
    styles.push(new Style({image: new CircleStyle({radius: 9, fill: new Fill({color}), stroke: new Stroke({color: '#fff', width: 3})})}));
    this.dotFeature.setStyle(styles);
    this.accFeature.setStyle(
      new Style({fill: new Fill({color: stale ? 'rgba(120,120,120,0.12)' : 'rgba(26,115,232,0.15)'}), stroke: new Stroke({color: stale ? DOT_STALE : 'rgba(26,115,232,0.9)', width: 1.5})}),
    );
  }

  /** Nivel de calidad para colorear el indicador. */
  quality() {
    if (!this.fix) return 'none';
    if (this.isStale()) return 'stale';
    const a = this.fix.acc;
    if (a <= 3) return 'good';
    if (a <= 8) return 'fair';
    return 'poor';
  }

  // -------------------------------------------------------------------------
  // Simulación (modo demostración): recorre una lista de vértices [lon,lat]
  // a velocidad de caminata con un ruido de ±1,5 m para practicar sin salir.
  startSimulation(path, speed = 1.3) {
    this.stopSimulation();
    if (HAS_NATIVE) call('stopLocation');
    else if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    let i = 0, frac = 0;
    const R = 6378137;
    this.sim = {path};
    this.simTimer = setInterval(() => {
      if (i >= path.length - 1) {
        this.stopSimulation();
        return;
      }
      const a = path[i], b = path[i + 1];
      const dx = ((b[0] - a[0]) * Math.PI * R * Math.cos((a[1] * Math.PI) / 180)) / 180;
      const dy = ((b[1] - a[1]) * Math.PI * R) / 180;
      const L = Math.hypot(dx, dy) || 1e-9;
      frac += speed / L;
      while (frac >= 1 && i < path.length - 1) {
        i++;
        frac -= 1;
        if (i >= path.length - 1) break;
      }
      const p = path[Math.min(i, path.length - 1)], q = path[Math.min(i + 1, path.length - 1)];
      const lon = p[0] + (q[0] - p[0]) * Math.min(frac, 1), lat = p[1] + (q[1] - p[1]) * Math.min(frac, 1);
      const n = () => (Math.random() * 2 - 1) * 1.5;
      const course = (Math.atan2((q[0] - p[0]) * Math.cos((lat * Math.PI) / 180), q[1] - p[1]) * 180) / Math.PI;
      this.handleFix({
        lat: lat + n() / 111320, lon: lon + n() / (111320 * Math.cos((lat * Math.PI) / 180)), acc: 2.5 + Math.random(),
        alt: 45, speed, course: (course + 360) % 360, time: Date.now(), provider: 'sim',
      });
    }, 1000);
    this.emit('sim');
  }

  stopSimulation() {
    if (!this.sim) return;
    clearInterval(this.simTimer);
    this.sim = null;
    this.fix = null;
    this.emit('sim');
    if (this.running) this.start();
  }
}
