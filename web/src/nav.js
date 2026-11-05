// Motor de navegación: seguir una línea o recorrer puntos en orden.
//
// Todos los cálculos de desvío y avance se hacen en un plano Transverso de
// Mercator local (k0 = 1) centrado en la ruta, donde la distorsión de escala
// es despreciable a escala de finca; las distancias y rumbos al objetivo se
// calculan con el inverso de Vincenty sobre WGS 84.
//
// Ajuste a la ruta (map-matching) con restricción de avance: nunca se busca
// la línea más cercana en toda la ruta, porque con pasadas a 5 m y un error de
// 3–5 m en el teléfono el seguimiento saltaría a la pasada vecina. Solo se
// comparan el tramo activo k y el siguiente k+1 (y k−1 para retroceder). Se
// avanza a k+1 cuando se cruza la perpendicular del final del tramo, o cuando
// k+1 queda más cerca durante 2 lecturas seguidas. Es una forma simplificada
// del ajuste incremental descrito por Quddus, Ochieng y Noland (2007),
// Transportation Research Part C, 15(5), 312–328. Solo si la posición queda
// lejos de esos tramos durante varias lecturas (o con «Ubicarme en la ruta»)
// se busca en toda la ruta.
//
// Los resultados usan códigos neutros ('left', 'right', 'straight', 'end'); la
// interfaz elige la frase completa en cada idioma.

import {localPlane} from './crs.js';
import {inverse, angleDiff, norm360} from './geodesy.js';
import {t} from './i18n.js';

const CONFIRM_FIXES = 2;    // lecturas seguidas para cambiar de tramo
const RESYNC_AFTER = 8;     // lecturas lejos de la ruta antes de buscar en toda ella
const RESYNC_DIST_M = 25;   // distancia que se considera "lejos"
const TURN_MIN_DEG = 15;    // cambios de dirección menores se consideran «seguir recto»
const WRONG_WAY_FIXES = 5;  // lecturas seguidas en sentido contrario para avisar
const WRONG_WAY_DEG = 120;  // diferencia mínima entre la marcha y el sentido de la línea
const WRONG_WAY_SPEED = 0.5; // m/s: por debajo, el rumbo del GNSS no es fiable

/**
 * Proyecta P sobre el segmento AB (coordenadas planas).
 * @returns {{t:number, qx:number, qy:number, d:number, side:number}}
 *   t en [0,1], punto Q más cercano, distancia |PQ| y lado (+1 izquierda, −1 derecha, según el sentido A→B).
 */
export function projectOnSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const tr = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
  const tc = Math.max(0, Math.min(1, tr));
  const qx = ax + tc * vx, qy = ay + tc * vy;
  const cross = vx * (py - ay) - vy * (px - ax);
  return {t: tc, tr, qx, qy, d: Math.hypot(px - qx, py - qy), side: cross > 0 ? 1 : cross < 0 ? -1 : 0}; // i18n-ok
}

/** Rumbo de cuadrícula (desde el norte del plano local, en sentido horario). */
function gridBearing(ax, ay, bx, by) {
  return norm360((Math.atan2(bx - ax, by - ay) * 180) / Math.PI);
}

/** Código de giro según el cambio de dirección (+ derecha, − izquierda). */
export function turnDir(delta) {
  return Math.abs(delta) < TURN_MIN_DEG ? 'straight' : delta > 0 ? 'right' : 'left';
}

/**
 * ¿Es una ruta de líneas de ida y vuelta (como las del planificador)? Los tramos pares son
 * las líneas y los impares los cambios de línea, y cada línea va en sentido contrario a la
 * anterior. Se acepta si al menos el 75 % de los pares de líneas seguidas son antiparalelas
 * (±10°): así una pasada cruzada o el paso entre celdas no la descartan, pero un camino que
 * solo se curva (líneas paralelas, no opuestas) sí.
 * @param {number[][]} xy vértices en el plano local
 * @returns {{count:number}|null} número de líneas, o null si no tiene esa forma
 */
export function detectLines(xy) {
  const nSeg = xy.length - 1;
  if (nSeg < 3 || nSeg % 2 === 0) return null;
  const count = (nSeg + 1) / 2;
  let opposite = 0, lineLen = 0, total = 0;
  const brg = (i) => gridBearing(xy[i][0], xy[i][1], xy[i + 1][0], xy[i + 1][1]);
  for (let i = 0; i < nSeg; i++) {
    const L = Math.hypot(xy[i + 1][0] - xy[i][0], xy[i + 1][1] - xy[i][1]);
    total += L;
    if (i % 2 === 0) lineLen += L;
  }
  for (let i = 0; i + 2 < nSeg; i += 2) if (Math.abs(angleDiff(brg(i + 2), brg(i))) > 170) opposite++;
  if (opposite / (count - 1) < 0.75 || lineLen < 0.6 * total) return null;
  return {count};
}

export class RouteFollower {
  /**
   * @param {number[][]} coords vértices [lon, lat] en WGS 84, en el orden de recorrido
   * @param {{name?: string, lines?: boolean}} [opts] lines: false para no tratarla como líneas de ida y vuelta
   */
  constructor(coords, opts = {}) {
    // Elimina vértices duplicados consecutivos
    const pts = [];
    for (const c of coords) {
      const last = pts[pts.length - 1];
      if (!last || last[0] !== c[0] || last[1] !== c[1]) pts.push([c[0], c[1]]);
    }
    if (pts.length < 2) throw new Error(t('La línea necesita al menos dos puntos distintos. Elija otra línea.'));
    this.name = opts.name || t('Ruta');
    this.ll = pts;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    }
    this.plane = localPlane((minX + maxX) / 2, (minY + maxY) / 2);
    this.xy = pts.map((p) => this.plane.fwd(p));
    this.cum = [0];
    for (let i = 1; i < this.xy.length; i++) {
      const a = this.xy[i - 1], b = this.xy[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    this.length = this.cum[this.cum.length - 1];
    // Giro en cada vértice interior (+ derecha, − izquierda)
    this.turnAt = this.xy.map((b, v) => {
      if (v === 0 || v === this.xy.length - 1) return 0;
      const a = this.xy[v - 1], c = this.xy[v + 1];
      return angleDiff(gridBearing(b[0], b[1], c[0], c[1]), gridBearing(a[0], a[1], b[0], b[1]));
    });
    this.lines = opts.lines === false ? null : detectLines(this.xy);
    this.chainage = 0;   // avance actual a lo largo de la ruta (m)
    this.segIndex = 0;
    this.outside = 0;
    this.wrongCount = 0;
    this.started = false;
  }

  /** Reinicia el seguimiento para que la próxima lectura busque en toda la ruta. */
  resync() {
    this.started = false;
    this.outside = 0;
    this.wrongCount = 0;
    this.fwdCount = this.backCount = 0;
  }

  /** Fija el avance en un punto concreto de la ruta (p. ej. al reanudar la navegación). */
  setChainage(s) {
    this.chainage = Math.max(0, Math.min(this.length, s));
    this.segIndex = this.segmentAt(this.chainage);
    this.started = true;
    this.outside = 0;
    this.fwdCount = this.backCount = 0;
  }

  segmentAt(s) {
    let i = 0;
    while (i < this.cum.length - 2 && this.cum[i + 1] <= s) i++;
    return i;
  }

  /** Busca el tramo más cercano entre los índices [i0, i1]. */
  nearest(px, py, i0, i1) {
    let best = null;
    for (let i = Math.max(0, i0); i <= Math.min(this.xy.length - 2, i1); i++) {
      const a = this.xy[i], b = this.xy[i + 1];
      const r = projectOnSegment(px, py, a[0], a[1], b[0], b[1]);
      if (!best || r.d < best.d - 1e-9) best = {...r, i};
    }
    return best;
  }

  /** Próximo giro de verdad (≥ 15°) a partir del vértice `from`, o el final de la ruta. */
  nextTurnFrom(from) {
    for (let v = from; v < this.xy.length - 1; v++) {
      if (Math.abs(this.turnAt[v]) >= TURN_MIN_DEG) {
        return {vertex: v, dist: Math.max(0, this.cum[v] - this.chainage), angle: this.turnAt[v], dir: turnDir(this.turnAt[v])};
      }
    }
    return {vertex: this.xy.length - 1, dist: Math.max(0, this.length - this.chainage), angle: 0, dir: 'end'};
  }

  /**
   * Actualiza con una posición GNSS.
   * @param {number[]} ll [lon, lat]
   * @param {{course?: number, speed?: number}} [motion] rumbo de marcha (grados) y velocidad (m/s) del GNSS
   * @returns {object} estado de navegación
   */
  update(ll, motion) {
    const [px, py] = this.plane.fwd(ll);
    const last = this.xy.length - 2; // índice del último tramo
    const prevChainage = this.chainage;
    const seg = (i) => {
      const a = this.xy[i], b = this.xy[i + 1];
      return {...projectOnSegment(px, py, a[0], a[1], b[0], b[1]), i};
    };
    let m;
    if (!this.started) {
      m = this.nearest(px, py, 0, last);
      this.started = true;
      this.fwdCount = this.backCount = 0;
    } else {
      let k = this.segIndex;
      let cur = seg(k);
      // Avance: cruzó la perpendicular del final, o el siguiente tramo está más cerca
      if (k < last) {
        const nxt = seg(k + 1);
        if (cur.tr >= 1 || nxt.d < cur.d) this.fwdCount++; // i18n-ok
        else this.fwdCount = 0;
        if (this.fwdCount >= CONFIRM_FIXES || (cur.tr >= 1 && nxt.d <= cur.d)) { // i18n-ok
          k++;
          cur = nxt;
          this.fwdCount = 0;
        }
      }
      // Retroceso (camina hacia atrás): antes del inicio del tramo y el anterior más cerca
      if (k > 0 && k === this.segIndex) {
        const prv = seg(k - 1);
        if (cur.tr <= 0 && prv.d < cur.d) this.backCount++;
        else this.backCount = 0;
        if (this.backCount >= CONFIRM_FIXES) {
          k--;
          cur = prv;
          this.backCount = 0;
        }
      }
      m = cur;
      // Muy lejos de la ruta durante varias lecturas: búsqueda global
      if (m.d > RESYNC_DIST_M) {
        if (++this.outside >= RESYNC_AFTER) {
          m = this.nearest(px, py, 0, last);
          this.outside = 0;
        }
      } else this.outside = 0;
    }
    const i = m.i;
    const segLen = this.cum[i + 1] - this.cum[i];
    this.segIndex = i;
    this.chainage = this.cum[i] + m.t * segLen;

    const a = this.xy[i], b = this.xy[i + 1];
    const segBearing = gridBearing(a[0], a[1], b[0], b[1]);
    // Próximo vértice (fin del tramo actual)
    const next = i + 1;
    const toNext = inverse(ll, this.ll[next]);
    const distToVertexAlong = this.cum[next] - this.chainage;
    // Giro en el próximo vértice
    let turn = null;
    if (next < this.xy.length - 1) turn = {angle: this.turnAt[next], dir: turnDir(this.turnAt[next])};

    // Sentido contrario: se mueve (≥ 0,5 m/s) en dirección opuesta a la línea y el avance baja,
    // durante varias lecturas seguidas. Parado, el contador no cambia.
    if (motion && motion.speed >= WRONG_WAY_SPEED && Number.isFinite(motion.course) && motion.course !== null) {
      const opposite = Math.abs(angleDiff(motion.course, segBearing)) > WRONG_WAY_DEG && m.d < 15; // i18n-ok
      this.wrongCount = opposite && this.chainage < prevChainage - 0.2 ? this.wrongCount + 1 : 0;
    }

    // Líneas de ida y vuelta: los tramos pares son líneas; los impares, cambios de línea
    let line = null, connector = false;
    if (this.lines) {
      connector = i % 2 === 1;
      line = connector ? (i + 1) / 2 + 1 : i / 2 + 1; // en un cambio de línea: la línea a la que va
    }

    // xte > 0: el usuario está a la IZQUIERDA de la línea → debe moverse a la derecha
    const xte = m.d * m.side;
    return {
      mode: 'line',
      xte,
      offset: m.d,
      correction: m.side > 0 ? 'right' : m.side < 0 ? 'left' : null, // i18n-ok
      chainage: this.chainage,
      length: this.length,
      remaining: this.length - this.chainage,
      progress: this.length > 0 ? this.chainage / this.length : 0,
      segment: i + 1,
      segments: this.xy.length - 1,
      segBearing,
      nextVertex: next,
      nextVertexLL: this.ll[next],
      distToNextVertex: toNext.distance,
      distAlongToVertex: distToVertexAlong,
      bearingToNextVertex: toNext.azimuth1,
      turn,
      nextTurn: this.nextTurnFrom(next),
      line,
      lines: this.lines ? this.lines.count : null,
      connector,
      wrongWay: this.wrongCount >= WRONG_WAY_FIXES,
      snappedLL: this.plane.inv([m.qx, m.qy]),
      finished: this.length - this.chainage < 1,
    };
  }
}

export class PointSequence {
  /**
   * @param {{ll:number[], name:string}[]} points en el orden de recorrido
   */
  constructor(points) {
    if (!points.length) throw new Error(t('No hay puntos para recorrer. Elija una capa con puntos.'));
    this.points = points;
    this.index = 0;
    this.visited = new Set();
  }

  get current() {
    return this.points[this.index];
  }

  goTo(i) {
    this.index = Math.max(0, Math.min(this.points.length - 1, i));
  }

  next() {
    this.goTo(this.index + 1);
  }

  prev() {
    this.goTo(this.index - 1);
  }

  markVisited() {
    this.visited.add(this.index);
  }

  /** Nombres de los puntos que faltan por visitar, en orden. */
  missing() {
    const out = [];
    this.points.forEach((p, i) => { if (!this.visited.has(i)) out.push(p.name); });
    return out;
  }

  /**
   * @param {number[]} ll posición actual [lon, lat]
   * @param {number} arrivalRadius radio de llegada (m)
   */
  update(ll, arrivalRadius) {
    const p = this.current;
    const r = inverse(ll, p.ll);
    return {
      mode: 'points',
      index: this.index,
      total: this.points.length,
      name: p.name,
      targetLL: p.ll,
      distance: r.distance,
      bearing: r.azimuth1,
      arrived: r.distance <= arrivalRadius,
      visited: this.visited.size,
      isLast: this.index === this.points.length - 1,
    };
  }
}

/** Navegación simple a un punto (sin secuencia). */
export function toTarget(ll, target) {
  const r = inverse(ll, target);
  return {distance: r.distance, bearing: r.azimuth1};
}
