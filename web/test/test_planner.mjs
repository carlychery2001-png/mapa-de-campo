// Planificador: compara con ruta_serpentina.py (node test/test_planner.mjs)
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerAll, localPlane} from '../src/crs.js';
import {makePlan, minAreaRect, photogrammetry, PlanError, MAX_POINTS, MAX_LINES} from '../src/planner.js';
import {inverse} from '../src/geodesy.js';

registerAll();
const ok = (m) => console.log('  ok', m);
const cancha = JSON.parse(readFileSync('../../salidas/cancha_futbol_EARTH.geojson', 'utf8')).features[0].geometry.coordinates[0];
const refPts = JSON.parse(readFileSync('../../salidas/ruta_5m/puntos_levantamiento.geojson', 'utf8')).features;
const resumen = JSON.parse(readFileSync('../../salidas/ruta_5m/resumen.json', 'utf8'));

// 1. Mismos parámetros que la ruta generada por el script (5 m, 5 m, margen 1 m, inicio SO, dirección automática)
const plan = makePlan(cancha, {mode: 'grid', spacing: 5, interval: 5, margin: 1, azimuth: 'auto', start: 'SW', distribution: 'even'});
assert.equal(plan.stats.nLines, resumen.lineas);
assert.equal(plan.stats.nPoints, resumen.puntos);
// El script da el rumbo respecto al norte de la cuadrícula UTM; la app respecto al norte verdadero.
// Convergencia de meridianos UTM 17N en EARTH ≈ −0.46°, así que 2.6° (cuadrícula) ≈ 2.14° (verdadero).
assert.ok(Math.abs(plan.stats.azimuth - (resumen.rumbo_lineas_deg - 0.46)) < 0.05, `rumbo ${plan.stats.azimuth}`);
// El script trabaja en la cuadrícula UTM (factor de escala 1.0006 en EARTH); la app en metros reales.
assert.ok(Math.abs(plan.stats.routeLength - resumen.largo_ruta_m) / resumen.largo_ruta_m < 0.002, `largo ${plan.stats.routeLength}`);
let maxD = 0, sumD = 0;
plan.points.forEach((p, i) => {
  const r = refPts[i].geometry.coordinates;
  const d = inverse(p.ll, r).distance;
  maxD = Math.max(maxD, d); sumD += d;
  assert.equal(p.line, refPts[i].properties.linea, `línea del punto ${i + 1}`);
});
assert.ok(maxD < 0.15, `máx ${maxD}`);
ok(`cancha EARTH: ${plan.stats.nLines} líneas, ${plan.stats.nPoints} puntos, rumbo ${plan.stats.azimuth.toFixed(2)}°, ruta ${plan.stats.routeLength.toFixed(1)} m; P001–P420 a ≤ ${(maxD * 100).toFixed(1)} cm del script (media ${(sumD / plan.points.length * 100).toFixed(1)} cm, diferencia por escala UTM)`);

// 2. Espaciado real entre líneas = 5.000 m y margen respetado
{
  const pl = localPlane(-83.593, 10.2155);
  const a0 = pl.fwd(plan.lines[0].coords[0]), a1 = pl.fwd(plan.lines[0].coords[1]), b0 = pl.fwd(plan.lines[1].coords[0]);
  const ux = (a1[0] - a0[0]), uy = (a1[1] - a0[1]), L = Math.hypot(ux, uy);
  const sep = Math.abs(((b0[0] - a0[0]) * uy - (b0[1] - a0[1]) * ux) / L);
  assert.ok(Math.abs(sep - 5) < 0.002, `sep ${sep}`);
  ok(`separación medida entre líneas consecutivas: ${sep.toFixed(4)} m`);
}

// 3. Rectángulo sintético 100 × 40 m girado 30°: dirección automática, número de líneas y largos
{
  const pl = localPlane(-83.6, 10.2);
  const ang = 30 * Math.PI / 180; // rumbo 30° del lado largo
  const u = [Math.sin(ang), Math.cos(ang)], v = [Math.cos(ang), -Math.sin(ang)];
  const corner = (s, t) => pl.inv([s * u[0] + t * v[0], s * u[1] + t * v[1]]);
  const rect = [corner(0, 0), corner(100, 0), corner(100, 40), corner(0, 40)];
  const p = makePlan(rect, {mode: 'lines', spacing: 10, interval: 10, margin: 2, azimuth: 'auto', start: 'SW'});
  assert.ok(Math.abs(p.stats.azimuth - 30) < 1e-3, `az ${p.stats.azimuth}`); // planos locales con centro distinto: convergencia < 1″
  assert.equal(p.stats.nLines, 4); // ancho útil 36 m → 4 líneas a 10 m (36 = 3×10 + 6, centradas)
  p.lines.forEach((l) => assert.ok(Math.abs(l.length - 96) < 1e-3, `largo ${l.length}`));
  assert.ok(Math.abs(p.stats.area - 4000) < 0.5, `área ${p.stats.area}`);
  ok('rectángulo 100×40 m a 30°: rumbo automático 30°, 4 líneas de 96 m (margen 2 m), área 4000 m²');
  const pr = makePlan(rect, {mode: 'lines', spacing: 10, interval: 10, margin: 2, azimuth: 120, start: 'SW'});
  assert.equal(pr.stats.nLines, 10); // 96 m útiles a lo largo → 10 líneas cruzadas
  pr.lines.forEach((l) => assert.ok(Math.abs(l.length - 36) < 1e-3));
  ok('mismo rectángulo con líneas a 120°: 10 líneas de 36 m');
  const d = makePlan(rect, {mode: 'double', spacing: 10, interval: 10, margin: 2, azimuth: 'auto', start: 'SW'});
  assert.equal(d.stats.nLines, 14);
  ok('doble cuadrícula: 4 + 10 = 14 líneas');
}

// 4. Polígono cóncavo (L) con margen: ningún punto a menos del margen del borde
{
  const pl = localPlane(-83.6, 10.2);
  const L = [[0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]].map((q) => pl.inv(q));
  const p = makePlan(L, {mode: 'grid', spacing: 4, interval: 4, margin: 1.5, azimuth: 0, start: 'SW'});
  const ring = [[0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]];
  const dseg = (q, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / (vx * vx + vy * vy))); return Math.hypot(q[0] - a[0] - t * vx, q[1] - a[1] - t * vy); };
  let minD = Infinity;
  for (const q of p.points) {
    const xy = pl.fwd(q.ll);
    let dmin = Infinity;
    for (let i = 0; i < ring.length; i++) dmin = Math.min(dmin, dseg(xy, ring[i], ring[(i + 1) % ring.length]));
    minD = Math.min(minD, dmin);
  }
  assert.ok(minD >= 1.5 - 0.002, `min ${minD}`);
  assert.ok(p.stats.nPoints > 100);
  ok(`polígono cóncavo en L: ${p.stats.nLines} tramos, ${p.stats.nPoints} puntos, todos a ≥ ${minD.toFixed(3)} m del borde (margen 1.5 m)`);
}

// 5. Inicio en cada esquina (códigos neutros SW/SE/NW/NE; los antiguos SO/NO siguen valiendo)
{
  const starts = {};
  for (const s of ['SW', 'SE', 'NW', 'NE', 'SO', 'NO']) {
    const p = makePlan(cancha, {mode: 'lines', spacing: 5, interval: 5, margin: 1, azimuth: 'auto', start: s});
    starts[s] = p.route[0];
  }
  assert.ok(starts.SW[0] < starts.SE[0] && starts.SW[1] < starts.NW[1] && starts.NE[0] > starts.NW[0] && starts.NE[1] > starts.SE[1]);
  assert.deepEqual(starts.SO, starts.SW);
  assert.deepEqual(starts.NO, starts.NW);
  ok('la esquina de inicio (SW/SE/NW/NE) cambia el primer punto como se espera; SO y NO (versiones anteriores) equivalen a SW y NW');
}

// 6. Calculadora fotogramétrica (fórmula de GSD de Pix4D)
{
  // Cámara de ejemplo: sensor 13.2 × 8.8 mm, focal 8.8 mm, 5472 × 3648 px, 100 m, 70 % lateral, 80 % frontal
  const r = photogrammetry({sensorW: 13.2, sensorH: 8.8, focal: 8.8, imgW: 5472, imgH: 3648}, 100, 0.7, 0.8, true);
  assert.ok(Math.abs(r.gsd * 100 - 2.741) < 0.002, `gsd ${r.gsd}`);
  assert.ok(Math.abs(r.footprintW - 150) < 1e-9 && Math.abs(r.footprintH - 100) < 1e-9);
  assert.ok(Math.abs(r.lineSpacing - 45) < 1e-9 && Math.abs(r.photoSpacing - 20) < 1e-9);
  ok('GSD 2.74 cm/px a 100 m; huella 150 × 100 m; líneas cada 45 m (70 %), fotos cada 20 m (80 %)');
}
console.log('\nPlanificador: pruebas superadas');

// 7. Esquinas marcadas en desorden → polígono sin cruces
{
  const {orderAroundCentroid} = await import('../src/planner.js');
  const pl = localPlane(-83.6, 10.2);
  const corners = [[0, 0], [50, 30], [50, 0], [0, 30]].map((q) => pl.inv(q)); // orden cruzado
  const p = makePlan(orderAroundCentroid(corners), {mode: 'grid', spacing: 5, interval: 5, margin: 0, azimuth: 'auto', start: 'SW'});
  assert.ok(Math.abs(p.stats.area - 1500) < 0.5, `área ${p.stats.area}`);
  console.log('  ok esquinas en desorden: se ordenan y el área es 1500 m² (sin cruces)');
}

// 8. Presets de cámara: el P4 RTK debe dar la regla oficial de DJI GSD = H/36.5 cm/px
{
  const {CAMERAS} = await import('../src/planui.js').catch(() => ({CAMERAS: null}));
  const cam = {sensorW: 13.2, sensorH: 8.8, focal: 8.8, imgW: 5472, imgH: 3648};
  for (const H of [30, 60, 100]) {
    const g = photogrammetry(cam, H, 0.7, 0.8).gsd * 100;
    assert.ok(Math.abs(g - H / 36.5) < 0.002 * H / 36.5 + 1e-3, `GSD ${g} vs ${H / 36.5}`);
  }
  console.log('  ok Phantom 4 RTK: GSD = H/36.5 cm/px (regla publicada por DJI) a 30, 60 y 100 m');
}

// 9. Cuadrícula real X × Y m: filas y columnas alineadas, separación exacta
{
  const pl = localPlane(-83.6, 10.2);
  const ang = 30 * Math.PI / 180;
  const u = [Math.sin(ang), Math.cos(ang)], v = [Math.cos(ang), -Math.sin(ang)];
  const corner = (s, t) => pl.inv([s * u[0] + t * v[0], s * u[1] + t * v[1]]);
  const rect = [corner(0, 0), corner(100, 0), corner(100, 40), corner(0, 40)];
  const g = makePlan(rect, {mode: 'grid', spacing: 10, interval: 10, margin: 0, azimuth: 'auto', start: 'SW', distribution: 'grid'});
  assert.equal(g.stats.nLines, 5);
  assert.equal(g.stats.nPoints, 55); // 5 líneas × 11 puntos
  // coordenadas (s a lo largo, t a lo ancho) de cada punto en el marco del rectángulo
  const st = g.points.map((p) => { const q = pl.fwd(p.ll); return [q[0] * u[0] + q[1] * u[1], q[0] * v[0] + q[1] * v[1]]; });
  const near = (a, b) => Math.abs(a - b) < 0.01;
  st.forEach(([s, t]) => {
    assert.ok(near(s / 10, Math.round(s / 10)), `s ${s}`);
    assert.ok(near(t / 10, Math.round(t / 10)), `t ${t}`);
  });
  console.log('  ok cuadrícula real 10 × 10 m en un rectángulo girado 30°: 55 puntos, todos en múltiplos exactos de 10 m (filas y columnas alineadas)');
  const g2 = makePlan(rect, {mode: 'grid', spacing: 5, interval: 2, margin: 0, azimuth: 'auto', start: 'SW', distribution: 'grid'});
  assert.equal(g2.stats.nLines, 9);
  assert.equal(g2.stats.nPoints, 9 * 51);
  console.log('  ok cuadrícula 5 × 2 m: 9 líneas × 51 puntos');
  let err = null;
  try { makePlan(rect, {mode: 'grid', spacing: 0.1, interval: 0.1, margin: 0, azimuth: 'auto', start: 'SW', distribution: 'grid'}); } catch (e) { err = e; }
  assert.ok(err && err.code === 'too-many-points', `código ${err && err.code}`);
  assert.equal(err.params.max, MAX_POINTS);
  assert.ok(err.params.estimate > MAX_POINTS && err.params.spacing === 0.1 && err.params.interval === 0.1);
  console.log('  ok resolución demasiado fina (0.1 × 0.1 m en 4000 m²): se rechaza con el código too-many-points y la estimación');
}
// 10. Cuadrícula real en polígono cóncavo: alineación común entre tramos separados
{
  const pl = localPlane(-83.6, 10.2);
  const U = [[0, 0], [60, 0], [60, 50], [40, 50], [40, 20], [20, 20], [20, 50], [0, 50]].map((q) => pl.inv(q));
  const g = makePlan(U, {mode: 'grid', spacing: 5, interval: 5, margin: 0, azimuth: 0, start: 'SW', distribution: 'grid'});
  const ys = g.points.map((p) => pl.fwd(p.ll)[1]);
  const base = ys[0];
  ys.forEach((y) => assert.ok(Math.abs(((y - base) / 5) - Math.round((y - base) / 5)) < 0.002, `y ${y}`));
  assert.equal(g.stats.nPoints, 119); // 4×11 + 5 + 3×5 + 11 + 4×11 (bordes incluidos)
  console.log(`  ok polígono en U: ${g.stats.nPoints} puntos en filas comunes cada 5 m también en los brazos separados`);
}

// ---------------------------------------------------------------- correcciones de la revisión
const {cleanRing, ringSelfIntersects} = await import('../src/planner.js');
const PL = localPlane(-83.6, 10.2);
const toLL = (ring) => ring.map((q) => PL.inv(q));
const inside = (q, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};

// 11. Borde caminado con GPS: vértices repetidos y miles de puntos en un arco → se simplifica a ≤ 1 cm
{
  const R = 80, n = 3000;
  const circle = Array.from({length: n}, (_, i) => [R * Math.cos((2 * Math.PI * i) / n), R * Math.sin((2 * Math.PI * i) / n)]);
  const walked = circle.flatMap((p, i) => (i % 7 === 0 ? [p, [p[0] + 0.0002, p[1]]] : [p])); // duplicados < 1 mm
  walked.push(walked[0]);
  const c = cleanRing(walked);
  assert.ok(c.length < 400, `vértices ${c.length}`);
  let maxDev = 0;
  const dseg = (q, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / (vx * vx + vy * vy))); return Math.hypot(q[0] - a[0] - t * vx, q[1] - a[1] - t * vy); };
  for (const q of circle) {
    let d = Infinity;
    for (let i = 0; i < c.length; i++) d = Math.min(d, dseg(q, c[i], c[(i + 1) % c.length]));
    maxDev = Math.max(maxDev, d);
  }
  assert.ok(maxDev <= 0.0101, `desvío ${maxDev}`);
  const t0 = performance.now();
  const p = makePlan(toLL(walked), {mode: 'grid', spacing: 2, interval: 2, margin: 1, azimuth: 'auto', start: 'SW', distribution: 'grid'});
  const ms = performance.now() - t0;
  assert.ok(Math.abs(p.stats.area - Math.PI * R * R) / (Math.PI * R * R) < 0.001, `área ${p.stats.area}`);
  assert.ok(ms < 3000, `${ms} ms`);
  console.log(`  ok borde caminado de ${walked.length} vértices → ${c.length} (desvío máx ${(maxDev * 1000).toFixed(1)} mm); plan 2 × 2 m con ${p.stats.nPoints} puntos en ${ms.toFixed(0)} ms`);
}

// 12. Contorno cruzado: 4 esquinas se reordenan solas; con más vértices, error claro
{
  const bow4 = toLL([[0, 0], [50, 30], [50, 0], [0, 30]]);
  const p = makePlan(bow4, {mode: 'lines', spacing: 5, interval: 5, margin: 0, azimuth: 'auto', start: 'SW'});
  assert.ok(p.stats.reordered && Math.abs(p.stats.area - 1500) < 0.5);
  assert.ok(ringSelfIntersects([[0, 0], [10, 10], [10, 0], [0, 10]]) && !ringSelfIntersects([[0, 0], [10, 0], [10, 10], [0, 10]]));
  let code = '';
  try { makePlan(toLL([[0, 0], [40, 0], [0, 30], [40, 30], [20, -10]]), {mode: 'lines', spacing: 5, margin: 0, azimuth: 'auto', start: 'SW'}); } catch (e) { code = e.code; }
  assert.equal(code, 'self-intersect');
  console.log('  ok contorno cruzado: 4 esquinas en desorden se reordenan (1500 m²); con 5 vértices cruzados, error self-intersect');
}

// 13. Área en U con líneas que cortan los dos brazos: se recorre por celdas, sin ir y venir sobre el hueco
{
  const Uxy = [[0, 0], [60, 0], [60, 50], [40, 50], [40, 20], [20, 20], [20, 50], [0, 50]];
  const p = makePlan(toLL(Uxy), {mode: 'lines', spacing: 5, interval: 5, margin: 0, azimuth: 90, start: 'SW'});
  assert.equal(p.stats.cells, 3, `celdas ${p.stats.cells}`);
  let overNotch = 0;
  for (let k = 0; k + 1 < p.lines.length; k++) {
    const a = PL.fwd(p.lines[k].coords[1]), b = PL.fwd(p.lines[k + 1].coords[0]);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (mid[0] > 20.5 && mid[0] < 39.5 && mid[1] > 20.5) overNotch++; // dentro del hueco de la U
  }
  assert.ok(overNotch <= 1, `cruces del hueco ${overNotch}`);
  console.log(`  ok área en U con líneas horizontales: ${p.stats.cells} celdas, ${p.stats.nLines} tramos, ${overNotch} paso(s) sobre el hueco (antes, uno por línea)`);
}

// 14. Reparto «cada N m desde el inicio»: el extremo solo si queda a ≥ 25 % del intervalo
{
  const mk = (len) => makePlan(toLL([[0, 0], [10, 0], [10, len], [0, len]]), {mode: 'lines', withPoints: true, spacing: 20, interval: 5, margin: 0, azimuth: 0, start: 'SW', distribution: 'exact'});
  const a = mk(23), b = mk(20.5);
  assert.equal(a.stats.nPoints, 6); // 0, 5, 10, 15, 20, 23
  assert.equal(b.stats.nPoints, 5); // 0, 5, 10, 15, 20 (el extremo a 0.5 m no se repite)
  console.log('  ok «cada 5 m»: línea de 23 m → 6 puntos (con extremo); de 20.5 m → 5 puntos (sin un punto pegado a 0.5 m)');
}

// 15. Huecos: área con un edificio en medio → área neta y ningún punto dentro del hueco
{
  const outer = [[0, 0], [100, 0], [100, 40], [0, 40]], hole = [[40, 15], [60, 15], [60, 25], [40, 25]];
  const p = makePlan({outer: toLL(outer), holes: [toLL(hole)]}, {mode: 'grid', spacing: 2, interval: 2, margin: 1, azimuth: 'auto', start: 'SW', distribution: 'grid'});
  assert.ok(Math.abs(p.stats.area - 3800) < 0.5, `área ${p.stats.area}`);
  const grown = [[39, 14], [61, 14], [61, 26], [39, 26]];
  const bad = p.points.filter((q) => inside(PL.fwd(q.ll), grown)).length;
  assert.equal(bad, 0);
  assert.equal(p.stats.holes, 1);
  console.log(`  ok área con un hueco de 20 × 10 m: área neta 3800 m², ${p.stats.nPoints} puntos, ninguno a menos de 1 m del hueco`);
}

// 16. Puntas agudas: no quedan líneas de largo casi cero
{
  const tri = toLL([[0, 0], [100, 0], [50, 0.8]]);
  const p = makePlan(tri, {mode: 'lines', spacing: 0.2, interval: 1, margin: 0, azimuth: 90, start: 'SW'});
  const minL = Math.min(...p.lines.map((l) => l.length));
  assert.ok(minL >= 0.02 * 0.2 - 1e-9, `mín ${minL}`);
  console.log(`  ok triángulo muy agudo: ${p.stats.nLines} líneas, la más corta mide ${(minL * 100).toFixed(1)} cm (ninguna casi nula)`);
}

// 17. Líneas con puntos demasiado finos: se generan las líneas solas, con aviso
{
  const big = toLL([[0, 0], [400, 0], [400, 300], [0, 300]]);
  const p = makePlan(big, {mode: 'lines', withPoints: true, spacing: 1, interval: 0.5, margin: 0, azimuth: 'auto', start: 'SW', distribution: 'grid'});
  assert.ok(p.stats.pointsSkipped && p.points.length === 0 && p.lines.length > 200);
  let err = null;
  try { makePlan(big, {mode: 'lines', spacing: 0.05, margin: 0, azimuth: 'auto', start: 'SW'}); } catch (e) { err = e; }
  assert.ok(err && err.code === 'too-many-lines' && err.params.max === MAX_LINES && err.params.spacing === 0.05);
  assert.equal(p.stats.maxPoints, MAX_POINTS);
  console.log(`  ok 400 × 300 m con puntos cada 0.5 m: ${p.lines.length} líneas sin puntos y aviso; 5 cm entre líneas se rechaza (too-many-lines, más de ${MAX_LINES})`);
}

// 18. Errores con código neutro (la interfaz los traduce): área sin espacio para líneas y área degenerada
{
  let err = null;
  try { makePlan(toLL([[0, 0], [10, 0], [10, 10], [0, 10]]), {mode: 'lines', spacing: 2, margin: 6, azimuth: 0, start: 'SW'}); } catch (e) { err = e; }
  assert.ok(err instanceof PlanError && err.code === 'no-lines' && err.params.margin === 6, `código ${err && err.code}`);
  err = null;
  try { makePlan(toLL([[0, 0], [10, 0], [20, 0]]), {mode: 'lines', spacing: 2, margin: 0, azimuth: 0, start: 'SW'}); } catch (e) { err = e; }
  assert.ok(err && err.code === 'area-too-small', `código ${err && err.code}`);
  err = null;
  try { makePlan(toLL([[0, 0], [10, 0]]), {mode: 'lines', spacing: 2, margin: 0, azimuth: 0, start: 'SW'}); } catch (e) { err = e; }
  assert.ok(err && err.code === 'area-vertices');
  err = null;
  try { makePlan(toLL([[0, 0], [10, 0], [10, 10]]), {mode: 'lines', spacing: 0, margin: 0, azimuth: 0, start: 'SW'}); } catch (e) { err = e; }
  assert.ok(err && err.code === 'bad-spacing');
  console.log('  ok errores con código: no-lines (margen 6 m en 10 × 10 m), area-too-small, area-vertices, bad-spacing');
}
console.log('\nCorrecciones de la revisión: pruebas superadas');
