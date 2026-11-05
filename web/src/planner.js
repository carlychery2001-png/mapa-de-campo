// Planificador de levantamientos: líneas paralelas en serpentina, cuadrícula de
// puntos y doble cuadrícula (cruzada) dentro de un polígono (con huecos), al
// estilo de las misiones de mapeo de DJI y Pix4Dcapture. Funciona en cualquier
// lugar: el área puede dibujarse, venir de un archivo o de esquinas marcadas.
//
// Todo se calcula en un plano Transverso de Mercator local (k0 = 1) centrado en
// el área, así que espaciados, intervalos y largos son distancias reales sobre
// el terreno (elipsoide WGS 84), no distancias de cuadrícula.
//
// Mismo criterio que el script ruta_serpentina.py del proyecto: las líneas van en la
// dirección indicada (o, en automático, paralelas al lado largo del rectángulo
// mínimo que contiene el área), quedan centradas en el ancho disponible y se
// recortan a un margen interior. En áreas cóncavas (en L, en U, con huecos) el
// recorrido se divide en celdas (descomposición boustrofédica) para no cruzar
// por fuera del área en cada línea.
//
// Este módulo no tiene textos de la interfaz: los errores llevan un código neutro (e.code) y sus
// datos (e.params), y planui.js los traduce. El mensaje en español (e.message) es solo para
// registros y pruebas.

import {localPlane} from './crs.js';

const D2R = Math.PI / 180;
/** Máximo de puntos de un plan (más dejaría al teléfono sin memoria). */
export const MAX_POINTS = 100000;
/** Máximo de líneas de un plan. */
export const MAX_LINES = 5000;

/** Esquina de inicio: códigos neutros (SW, SE, NW, NE) y los de versiones anteriores (SO, NO). */
const CORNER_DIR = {SW: [-1, -1], SE: [1, -1], NW: [-1, 1], NE: [1, 1], SO: [-1, -1], NO: [-1, 1]};

/**
 * Error de validación del plan.
 * Códigos: area-vertices, bad-spacing, area-vertices-distinct, self-intersect, area-too-small,
 * too-many-lines {spacing, max}, too-many-points {spacing, interval, estimate, max},
 * no-lines {spacing, margin}.
 */
export class PlanError extends Error {
  constructor(code, params, message) {
    super(message);
    this.name = 'PlanError';
    this.code = code;
    this.params = params || {};
  }
}

// ---------------------------------------------------------------- geometría plana

function rotate(p, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

export function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function distToSegment(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const L2 = vx * vx + vy * vy;
  let u = L2 > 0 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2 : 0;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(p[0] - a[0] - u * vx, p[1] - a[1] - u * vy);
}

/**
 * Limpia un anillo en metros: quita vértices repetidos (< 1 mm, también el
 * último contra el primero) y simplifica con Douglas–Peucker: ningún vértice
 * original queda a más de `tol` (1 cm) del anillo resultante. Así un borde
 * caminado con el GPS no deja cientos de vértices casi alineados.
 */
export function cleanRing(xy, tol = 0.01) {
  const r = [];
  for (const p of xy) {
    const q = r[r.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.001) r.push(p);
  }
  while (r.length > 1 && Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) <= 0.001) r.pop(); // i18n-ok: comparaciones, no es texto
  if (r.length <= 3) return r;
  let far = 0, fd = -1;
  r.forEach((p, i) => {
    const d = Math.hypot(p[0] - r[0][0], p[1] - r[0][1]);
    if (d > fd) { fd = d; far = i; }
  });
  const keep = new Uint8Array(r.length);
  keep[0] = keep[far] = 1;
  const stack = [[0, far], [far, r.length]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const a = r[i], c = r[j % r.length];
    let idx = -1, dmax = tol;
    for (let k = i + 1; k < j; k++) {
      const d = distToSegment(r[k], a, c);
      if (d > dmax) { dmax = d; idx = k; }
    }
    if (idx >= 0) {
      keep[idx] = 1;
      stack.push([i, idx], [idx, j]);
    }
  }
  const out = r.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : r;
}

function segsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** ¿El anillo se cruza a sí mismo? (aristas no consecutivas que se cortan; O(n²), hasta 4000 vértices) */
export function ringSelfIntersects(r) {
  const n = r.length;
  if (n > 4000) return false;
  for (let i = 0; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // aristas vecinas (cierre)
      if (segsCross(a, b, r[j], r[(j + 1) % n])) return true;
    }
  }
  return false;
}

function convexHull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); // i18n-ok: comparaciones, no es texto
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); // i18n-ok: comparaciones, no es texto
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/**
 * Rectángulo mínimo (por área) que contiene los puntos: devuelve el azimut del
 * lado largo (0–180°, desde el norte del plano local, en sentido horario), largo y ancho.
 */
export function minAreaRect(pts) {
  const h = convexHull(pts);
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const q of h) {
      const r = rotate(q, -ang);
      minX = Math.min(minX, r[0]); maxX = Math.max(maxX, r[0]);
      minY = Math.min(minY, r[1]); maxY = Math.max(maxY, r[1]);
    }
    const w = maxX - minX, hgt = maxY - minY, area = w * hgt;
    if (!best || area < best.area - 1e-9) best = {area, ang, w, hgt};
  }
  const longAng = best.w >= best.hgt ? best.ang : best.ang + Math.PI / 2;
  const az = (((90 - longAng / D2R) % 180) + 180) % 180;
  return {azimuth: az, length: Math.max(best.w, best.hgt), width: Math.min(best.w, best.hgt)};
}

/** Convexidad de un anillo ya limpio; los vértices alineados a < 1 cm no cuentan. */
function isConvex(r) {
  let sign = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], c = r[(i + 2) % r.length];
    if (distToSegment(b, a, c) < 0.01) continue; // vértice casi alineado: no decide
    const s = Math.sign((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]));
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Recorta un polígono con el semiplano a la izquierda de la recta a→b (Sutherland–Hodgman). */
function clipHalfPlane(poly, a, b) {
  const out = [];
  const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const f = sp / (sp - sq);
      out.push([p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1])]);
    }
  }
  return out;
}

/** Margen interior exacto (esquinas en inglete) para un polígono convexo en sentido antihorario. */
function insetConvex(r, m) {
  let poly = r.map((p) => [...p]);
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    poly = clipHalfPlane(poly, [a[0] + nx * m, a[1] + ny * m], [b[0] + nx * m, b[1] + ny * m]);
    if (poly.length < 3) return [];
  }
  return poly;
}

/** Aristas de todos los anillos (exterior y huecos). */
function edgesOf(rings) {
  const e = [];
  for (const r of rings) for (let i = 0; i < r.length; i++) e.push([r[i], r[(i + 1) % r.length]]);
  return e;
}

/**
 * Intervalos [y0, y1] donde la recta vertical x corta el área (regla par-impar,
 * con huecos). Un vértice a menos de 0.5 mm de la recta se toma como si estuviera
 * sobre ella, y la regla semiabierta lo cuenta del lado derecho: así una línea
 * que coincide con un borde (p. ej. el fondo de una U) no da tramos falsos por
 * el redondeo de la rotación ni por un borde inclinado una fracción de milímetro.
 */
function verticalIntervals(edges, x) {
  const ys = [];
  const snap = (v) => (Math.abs(v - x) < 0.0005 ? x : v); // i18n-ok: comparaciones, no es texto
  for (const [a, b] of edges) {
    const ax = snap(a[0]), bx = snap(b[0]);
    if ((ax <= x && bx > x) || (bx <= x && ax > x)) { // i18n-ok: comparaciones, no es texto
      const f = (x - ax) / (bx - ax);
      ys.push(a[1] + f * (b[1] - a[1]));
    }
  }
  ys.sort((p, q) => p - q);
  const out = [];
  for (let i = 0; i + 1 < ys.length; i += 2) out.push([ys[i], ys[i + 1]]);
  return out;
}

/**
 * Parte de [y0,y1] (sobre la recta x) a distancia ≥ m de cualquier borde
 * (bisección a 1 mm). Solo se consultan las aristas cuyo rango en x está a
 * menos de m de la recta, lo que mantiene el cálculo rápido en bordes largos.
 */
function trimByDistance(edges, x, y0, y1, m) {
  const near = edges.filter(([a, b]) => Math.min(a[0], b[0]) - m <= x && Math.max(a[0], b[0]) + m >= x); // i18n-ok: comparaciones, no es texto
  const ok = (y) => {
    for (const [a, b] of near) if (distToSegment([x, y], a, b) < m - 1e-9) return false;
    return true;
  };
  const step = Math.max(0.02, Math.min(0.25, m / 4));
  const res = [];
  let inside = false, start = null, prevY = y0;
  const refine = (lo, hi, wantOkAtHi) => {
    for (let k = 0; k < 40 && hi - lo > 0.001; k++) {
      const mid = (lo + hi) / 2;
      if (ok(mid) === wantOkAtHi) hi = mid;
      else lo = mid;
    }
    return wantOkAtHi ? hi : lo;
  };
  for (let y = y0; y <= y1 + 1e-9; y += step) {
    const yy = Math.min(y, y1);
    const o = ok(yy);
    if (o && !inside) {
      start = yy === y0 ? yy : refine(prevY, yy, true);
      inside = true;
    } else if (!o && inside) {
      res.push([start, refine(prevY, yy, false)]);
      inside = false;
    }
    prevY = yy;
    if (yy === y1) break;
  }
  if (inside) res.push([start, y1]);
  return res;
}

// ---------------------------------------------------------------- plan

/**
 * @param {number[][] | {outer:number[][], holes?:number[][][]}} areaLL anillo del área
 *   [lon, lat] (cerrado o no), o {outer, holes} con huecos
 * @param {object} o opciones
 * @param {'lines'|'grid'|'double'} o.mode
 * @param {number} o.spacing separación entre líneas (m)
 * @param {number} o.interval separación entre puntos sobre cada línea (m)
 * @param {number|'auto'} o.azimuth dirección de las líneas (° desde el norte) o 'auto'
 * @param {number} o.margin margen interior desde el borde (m, ≥ 0)
 * @param {'grid'|'even'|'exact'} o.distribution reparto de puntos: 'grid' = cuadrícula real
 *   (filas y columnas alineadas cada `interval` m en todas las líneas), 'even' = parejo con un
 *   punto en cada extremo de cada línea (como ruta_serpentina.py), 'exact' = cada `interval` m
 *   desde el inicio de cada línea (el extremo solo si queda a ≥ 25 % del intervalo)
 * @param {'SW'|'SE'|'NW'|'NE'|'near'} o.start esquina de inicio (suroeste, sureste, noroeste,
 *   noreste; también acepta los códigos antiguos 'SO' y 'NO'), o la más cercana a o.nearLL
 * @param {number[]} [o.nearLL] posición actual [lon, lat] para start = 'near'
 * @param {boolean} [o.withPoints] en modo líneas, generar también puntos
 */
export function makePlan(areaLL, o) {
  const outerLL = Array.isArray(areaLL) ? areaLL : areaLL.outer;
  const holesLL = Array.isArray(areaLL) ? [] : areaLL.holes || [];
  if (!outerLL || outerLL.length < 3) throw new PlanError('area-vertices', {min: 3}, 'El área necesita al menos 3 vértices.'); // i18n-ok
  if (!(Number(o.spacing) > 0)) throw new PlanError('bad-spacing', {}, 'La separación entre líneas debe ser mayor que 0.'); // i18n-ok
  const spacing = Number(o.spacing);
  let cx = 0, cy = 0;
  outerLL.forEach((p) => { cx += p[0]; cy += p[1]; });
  const plane = localPlane(cx / outerLL.length, cy / outerLL.length);
  let xy = cleanRing(outerLL.map((p) => plane.fwd(p)));
  if (xy.length < 3) throw new PlanError('area-vertices-distinct', {min: 3}, 'El área necesita al menos 3 vértices distintos.'); // i18n-ok
  let reordered = false;
  if (ringSelfIntersects(xy)) {
    if (xy.length !== 4) throw new PlanError('self-intersect', {}, 'El contorno del área se cruza a sí mismo.'); // i18n-ok
    // Cuatro esquinas tocadas en desorden: se ordenan alrededor del centro
    const mx = xy.reduce((acc, p) => acc + p[0], 0) / 4, my = xy.reduce((acc, p) => acc + p[1], 0) / 4;
    xy = [...xy].sort((p, q) => Math.atan2(p[1] - my, p[0] - mx) - Math.atan2(q[1] - my, q[0] - mx));
    reordered = true;
  }
  let area = ringArea(xy);
  if (Math.abs(area) < 1) throw new PlanError('area-too-small', {}, 'El área es demasiado pequeña o sus vértices están alineados.'); // i18n-ok
  if (area < 0) xy = xy.reverse(); // exterior antihorario
  const holes = holesLL
    .map((h) => cleanRing(h.map((p) => plane.fwd(p))))
    .filter((h) => h.length >= 3)
    .map((h) => (ringArea(h) > 0 ? h.reverse() : h)); // huecos en sentido horario
  const holesArea = holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0);
  area = Math.abs(area) - holesArea;
  const rings = [xy, ...holes];
  const perimeter = rings.reduce((s, r) => s + r.reduce((acc, p, i) => acc + Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1]), 0), 0);
  const mar = minAreaRect(xy);
  const az = o.azimuth === 'auto' || o.azimuth === undefined || o.azimuth === null || o.azimuth === '' ? mar.azimuth : ((Number(o.azimuth) % 180) + 180) % 180;
  const margin = Math.max(0, Number(o.margin) || 0);
  const interval = Number(o.interval) > 0 ? Number(o.interval) : spacing;
  let wantPoints = o.mode === 'grid' || (o.mode === 'lines' && !!o.withPoints);
  let pointsSkipped = false;
  // Límites de seguridad: con resoluciones muy finas el teléfono se quedaría sin memoria
  const estLines = (mar.width / spacing + 2) * (o.mode === 'double' ? 2 : 1) + (o.mode === 'double' ? mar.length / spacing : 0);
  if (Math.max(mar.width, mar.length) / spacing > MAX_LINES) {
    throw new PlanError('too-many-lines', {spacing, max: MAX_LINES}, `Con ${spacing} m entre líneas saldrían más de ${MAX_LINES} líneas.`); // i18n-ok
  }
  if (wantPoints) {
    const est = area / (spacing * interval);
    if (est > MAX_POINTS) {
      if (o.mode === 'grid') throw new PlanError('too-many-points', {spacing, interval, estimate: Math.round(est), max: MAX_POINTS}, `Con ${spacing} × ${interval} m saldrían unos ${Math.round(est)} puntos (máximo ${MAX_POINTS}).`); // i18n-ok
      wantPoints = false;
      pointsSkipped = true; // en «líneas» se generan solo las líneas
    }
  }

  const passes = [sweep(rings, az, spacing, margin)];
  if (o.mode === 'double') passes.push(sweep(rings, (az + 90) % 180, spacing, margin));
  if (!passes[0].length) throw new PlanError('no-lines', {spacing, margin}, 'Con ese margen y separación no cabe ninguna línea dentro del área.'); // i18n-ok

  // Orden en serpentina, por celdas, empezando en la esquina pedida
  const ordered = [];
  for (let pi = 0; pi < passes.length; pi++) {
    const from = ordered.length ? ordered[ordered.length - 1].b : null;
    const startXY = pi === 0 ? (o.start === 'near' && o.nearLL ? plane.fwd(o.nearLL) : null) : from;
    ordered.push(...orderPass(passes[pi], pi === 0 ? o.start : 'continue', startXY, pi));
  }

  // Cuadrícula real: posiciones a lo largo de las líneas comunes a toda la pasada,
  // centradas en el largo disponible (igual que las líneas en el ancho).
  const lattice = passes.map((segs) => {
    let lo = Infinity, hi = -Infinity;
    for (const sg of segs) { lo = Math.min(lo, sg.y0); hi = Math.max(hi, sg.y1); }
    const len = hi - lo;
    const n = Math.floor(len / interval + 1e-9) + 1;
    return {off: lo + (len - (n - 1) * interval) / 2, n};
  });

  const lines = [];
  const points = [];
  const route = [];
  ordered.forEach((s, k) => {
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    lines.push({line: k + 1, pass: s.pass, cell: s.cell, length: L, coords: [plane.inv(s.a), plane.inv(s.b)]});
    route.push(plane.inv(s.a), plane.inv(s.b));
    if (!wantPoints) return;
    if (o.distribution === 'grid') {
      const lat = lattice[s.pass];
      const ys = [];
      // tolerancia de 1 mm: un punto de la cuadrícula justo en el extremo del tramo (sobre el
      // borde o el margen) se conserva aunque el redondeo lo deje una fracción de mm afuera
      const k0 = Math.ceil((s.y0 - lat.off - 0.001) / interval), k1 = Math.floor((s.y1 - lat.off + 0.001) / interval);
      for (let q = Math.max(0, k0); q <= Math.min(lat.n - 1, k1); q++) ys.push(lat.off + q * interval);
      if (!s.up) ys.reverse();
      for (const y of ys) points.push({line: k + 1, ll: plane.inv(rotate([s.x, y], -s.ang))});
      return;
    }
    const ds = [];
    if (o.distribution === 'exact') {
      for (let d = 0; d < L - 1e-6; d += interval) ds.push(d);
      const last = ds[ds.length - 1];
      if (L - last >= Math.max(0.05, 0.25 * interval)) ds.push(L);
    } else if (L < interval / 2) {
      ds.push(L / 2); // tramo corto: un solo punto, en su centro
    } else {
      const n = Math.max(1, Math.round(L / interval));
      for (let i = 0; i <= n; i++) ds.push((L * i) / n);
    }
    for (const d of ds) {
      const f = L > 0 ? d / L : 0;
      points.push({line: k + 1, ll: plane.inv([s.a[0] + f * (s.b[0] - s.a[0]), s.a[1] + f * (s.b[1] - s.a[1])])});
    }
  });
  const width = Math.max(3, String(points.length).length);
  points.forEach((p, i) => {
    p.id = i + 1;
    p.name = 'P' + String(i + 1).padStart(width, '0');
  });
  let routeLen = 0;
  for (let i = 1; i < route.length; i++) {
    const a = plane.fwd(route[i - 1]), b = plane.fwd(route[i]);
    routeLen += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const linesLen = lines.reduce((s, x) => s + x.length, 0);
  const cells = new Set(ordered.map((s) => `${s.pass}:${s.cell}`)).size;
  return {
    lines,
    route,
    points,
    stats: {
      area,
      perimeter,
      azimuth: az,
      autoAzimuth: mar.azimuth,
      nLines: lines.length,
      linesLength: linesLen,
      routeLength: routeLen,
      nPoints: points.length,
      spacing,
      interval,
      margin,
      distribution: o.distribution,
      holes: holes.length,
      cells,
      pointsSkipped,
      maxPoints: MAX_POINTS,
      reordered,
      estLines: Math.round(estLines),
    },
  };
}

/**
 * Una pasada de líneas con azimut az: segmentos {x, i, a, b, y0, y1, ang} en el
 * plano local (a y b sin rotar; x, y0, y1 en el marco rotado).
 */
function sweep(rings, az, spacing, margin) {
  const ang = az * D2R; // girar +az (antihorario) deja las líneas verticales
  const rot = rings.map((r) => r.map((p) => rotate(p, ang)));
  const convex = rot.length === 1 && isConvex(rot[0]);
  let regionEdges = edgesOf(rot);
  let extentRing = rot[0];
  if (margin > 0 && convex) {
    const inset = insetConvex(rot[0], margin);
    if (inset.length < 3) return [];
    regionEdges = edgesOf([inset]);
    extentRing = inset;
  }
  let minX = Infinity, maxX = -Infinity;
  for (const p of extentRing) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); }
  if (margin > 0 && !convex) { minX += margin; maxX -= margin; }
  const w = maxX - minX;
  if (w < 0) return [];
  const n = Math.floor(w / spacing + 1e-9) + 1;
  const off = minX + (w - (n - 1) * spacing) / 2; // líneas centradas en el ancho
  const minLen = Math.max(0.01, 0.02 * spacing); // descarta tramos casi nulos
  const allEdges = edgesOf(rot);
  const segs = [];
  for (let i = 0; i < n; i++) {
    const x = Math.min(Math.max(off + i * spacing, minX + 0.001), maxX - 0.001);
    let ivs = verticalIntervals(regionEdges, x);
    if (margin > 0 && !convex) ivs = ivs.flatMap(([y0, y1]) => trimByDistance(allEdges, x, y0, y1, margin));
    for (const [y0, y1] of ivs) {
      if (y1 - y0 < minLen) continue;
      segs.push({x, i, a: rotate([x, y0], -ang), b: rotate([x, y1], -ang), y0, y1, ang});
    }
  }
  return segs;
}

/**
 * Ordena una pasada en serpentina. Primero divide las líneas en celdas: una
 * celda nueva empieza cuando cambia el número de tramos por línea o un tramo deja
 * de solaparse con el de la línea anterior (descomposición boustrofédica). Cada
 * celda se recorre en serpentina y se pasa a la celda más cercana.
 */
function orderPass(segs, start, nearXY, passIndex = 0) {
  const byLine = [];
  for (const s of segs) (byLine[s.i] = byLine[s.i] || []).push(s);
  const lines = byLine.filter(Boolean).map((g) => g.sort((p, q) => p.y0 - q.y0));
  const cells = [];
  let current = null, prev = null;
  for (const g of lines) {
    const same = prev && g.length === prev.length && g.every((s, k) => s.y0 <= prev[k].y1 + 1e-6 && s.y1 >= prev[k].y0 - 1e-6);
    if (!same) {
      current = g.map(() => []);
      cells.push(...current);
    }
    g.forEach((s, k) => current[k].push(s));
    prev = g;
  }
  const variants = (cell, ci) =>
    [[false, true], [false, false], [true, true], [true, false]].map(([rev, up0]) => {
      const seq = rev ? [...cell].reverse() : cell;
      let up = up0;
      const out = [];
      for (const s of seq) {
        out.push({a: up ? s.a : s.b, b: up ? s.b : s.a, x: s.x, y0: s.y0, y1: s.y1, ang: s.ang, up, cell: ci, pass: passIndex});
        up = !up;
      }
      return out;
    });
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  let score;
  if (nearXY) score = (v) => -dist(v[0].a, nearXY);
  else {
    const dir = CORNER_DIR[start] || CORNER_DIR.SW;
    score = (v) => v[0].a[0] * dir[0] + v[0].a[1] * dir[1];
  }
  const left = cells.map((c, ci) => ({ci, vs: variants(c, ci)}));
  const out = [];
  while (left.length) {
    let best = null, bestV = -Infinity, bestIdx = -1;
    left.forEach((c, idx) => {
      for (const v of c.vs) {
        const val = out.length ? -dist(v[0].a, out[out.length - 1].b) : score(v);
        if (val > bestV + 1e-9) { best = v; bestV = val; bestIdx = idx; }
      }
    });
    out.push(...best);
    left.splice(bestIdx, 1);
  }
  return out;
}

/**
 * Ordena puntos sueltos (p. ej. esquinas marcadas en cualquier orden) por su
 * ángulo alrededor del centroide, para formar un polígono sin cruces. Correcto
 * para áreas convexas, que es el caso típico de esquinas de un lote.
 */
export function orderAroundCentroid(ll) {
  let cx = 0, cy = 0;
  ll.forEach((p) => { cx += p[0]; cy += p[1]; });
  cx /= ll.length; cy /= ll.length;
  const k = Math.cos((cy * Math.PI) / 180);
  return [...ll].sort((a, b) => Math.atan2(a[1] - cy, (a[0] - cx) * k) - Math.atan2(b[1] - cy, (b[0] - cx) * k));
}

// ---------------------------------------------------------------- calculadora fotogramétrica

/**
 * GSD y huella en el terreno de una cámara a una altura sobre el terreno.
 * GSD = (ancho del sensor × altura) / (focal × ancho de imagen)  (Pix4D).
 * @param {{sensorW:number, sensorH:number, focal:number, imgW:number, imgH:number}} cam mm y píxeles
 * @param {number} altitude m sobre el terreno
 * @param {number} sideOverlap 0–1
 * @param {number} frontOverlap 0–1
 * @param {boolean} [longSideAcross=true] el lado largo de la imagen va perpendicular al vuelo
 */
export function photogrammetry(cam, altitude, sideOverlap, frontOverlap, longSideAcross = true) {
  const gsd = (cam.sensorW * altitude) / (cam.focal * cam.imgW); // m/px
  const footW = gsd * cam.imgW;
  const footH = gsd * cam.imgH;
  const across = longSideAcross ? footW : footH;
  const along = longSideAcross ? footH : footW;
  return {
    gsd,
    footprintW: footW,
    footprintH: footH,
    lineSpacing: across * (1 - sideOverlap),
    photoSpacing: along * (1 - frontOverlap),
  };
}
