// Pruebas de los cálculos geodésicos y de navegación (node test/test_math.mjs)
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerAll, fromWgs84, toWgs84, normalizeCode, utmCodeFor, localPlane} from '../src/crs.js';
import {inverse, toDMS, angleDiff, cardinal} from '../src/geodesy.js';
import {RouteFollower, PointSequence, projectOnSegment, detectLines} from '../src/nav.js';
import {setLang} from '../src/i18n.js';

registerAll();
let n = 0;
const ok = (name) => { n++; console.log('  ok', name); };
const dms = (d, m, s) => Math.sign(d) * (Math.abs(d) + m / 60 + s / 3600);

// 1. Vincenty: ejemplo Flinders Peak → Buninyong (Geoscience Australia)
{
  const p1 = [dms(144, 25, 29.5244), -dms(37, 57, 3.7203)];
  const p2 = [dms(143, 55, 35.3839), -dms(37, 39, 10.1561)];
  const r = inverse(p1, p2);
  assert.ok(Math.abs(r.distance - 54972.271) < 0.002, `dist ${r.distance}`);
  assert.ok(Math.abs(r.azimuth1 - dms(306, 52, 5.37)) < 0.5 / 3600, `az1 ${r.azimuth1}`);
  assert.ok(Math.abs(r.azimuth2 - (dms(127, 10, 25.07) + 180)) < 0.5 / 3600, `az2 ${r.azimuth2}`);
  ok('Vincenty inverso (54 972,271 m; 306°52′05,37″)');
}
// 2. Proyecciones contra los valores del CSV de la ruta (calculados con GDAL/PROJ)
{
  const csv = readFileSync('../../salidas/ruta_5m/puntos_levantamiento.csv', 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
  const hdr = csv[0].split(',');
  const col = (k) => hdr.indexOf(k);
  let maxUtm = 0, maxCr = 0;
  for (const line of csv.slice(1, 60)) {
    const v = line.split(',');
    const ll = [+v[col('lon')], +v[col('lat')]];
    const u = fromWgs84('EPSG:32617', ll);
    maxUtm = Math.max(maxUtm, Math.hypot(u[0] - v[col('este_utm17n')], u[1] - v[col('norte_utm17n')]));
    const c = fromWgs84('EPSG:5367', ll);
    maxCr = Math.max(maxCr, Math.hypot(c[0] - v[col('este_crtm05')], c[1] - v[col('norte_crtm05')]));
    const back = toWgs84('EPSG:32617', u);
    assert.ok(Math.abs(back[0] - ll[0]) < 1e-9 && Math.abs(back[1] - ll[1]) < 1e-9);
  }
  assert.ok(maxUtm < 0.002, `UTM ${maxUtm}`);
  assert.ok(maxCr < 0.25, `CRTM05 ${maxCr}`);
  ok(`UTM 17N (máx. ${(maxUtm * 1000).toFixed(2)} mm) y CRTM05 (máx. ${(maxCr * 100).toFixed(1)} cm, por el cambio de datum CR05 EPSG:9752)`);
}
// 3. Utilidades
{
  assert.equal(normalizeCode('urn:ogc:def:crs:EPSG::32617'), 'EPSG:32617');
  assert.equal(normalizeCode('urn:ogc:def:crs:OGC:1.3:CRS84'), 'EPSG:4326');
  assert.equal(normalizeCode('http://www.opengis.net/def/crs/EPSG/0/8908'), 'EPSG:8908');
  assert.equal(normalizeCode(5367), 'EPSG:5367');
  assert.equal(utmCodeFor(-83.59, 10.21), 'EPSG:32617');
  assert.equal(utmCodeFor(-84.5, 10.0), 'EPSG:32616');
  assert.equal(utmCodeFor(-70, -33), 'EPSG:32719');
  // Letras de hemisferio y puntos cardinales según el idioma (solo para mostrar);
  // con {neutral: true}, N/S/E/W para copiar a un SIG. Los segundos siempre con punto.
  setLang('es');
  assert.equal(toDMS(10.21485840, true), '10°12′53.49″ N');
  assert.equal(toDMS(-83.59297594, false), '83°35′34.71″ O');
  assert.equal(toDMS(-83.59297594, false, 2, {neutral: true}), '83°35′34.71″ W');
  assert.equal(cardinal(44), 'NE');
  assert.equal(cardinal(270), 'O');
  assert.equal(cardinal(225), 'SO');
  assert.equal(cardinal(247, 16), 'OSO');
  setLang('en');
  assert.equal(toDMS(-83.59297594, false), '83°35′34.71″ W');
  assert.equal(cardinal(270), 'W');
  assert.equal(cardinal(315), 'NW');
  setLang('fr');
  assert.equal(cardinal(225), 'SO');
  setLang('pt');
  assert.equal(cardinal(90), 'L');
  assert.equal(toDMS(12.5, false), '12°30′00.00″ L');
  assert.equal(cardinal(359), 'N');
  setLang('es');
  assert.equal(angleDiff(10, 350), 20);
  assert.equal(angleDiff(350, 10), -20);
  ok('normalización de códigos EPSG, zonas UTM, DMS y puntos cardinales por idioma, ángulos');
}
// 4. Plano local: escala ~1 (distancia plana vs Vincenty a 1 km)
{
  const pl = localPlane(-83.593, 10.215);
  const a = [-83.593, 10.215], b = [-83.584, 10.2185];
  const pa = pl.fwd(a), pb = pl.fwd(b);
  const dPlane = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  const dGeo = inverse(a, b).distance;
  assert.ok(Math.abs(dPlane - dGeo) < 0.005, `${dPlane} vs ${dGeo}`);
  ok(`plano TM local: ${dGeo.toFixed(3)} m geodésicos vs ${dPlane.toFixed(3)} m planos`);
}
// 5. Proyección sobre segmento y lado
{
  const r = projectOnSegment(1, 1, 0, 0, 0, 10); // segmento hacia el norte, punto al este
  assert.equal(r.side, -1); assert.ok(Math.abs(r.d - 1) < 1e-12); assert.ok(Math.abs(r.t - 0.1) < 1e-12);
  const l = projectOnSegment(-2, 5, 0, 0, 0, 10);
  assert.equal(l.side, 1);
  ok('proyección sobre segmento: este de una línea al norte = derecha (lado −1)');
}
// 6. Seguimiento de la ruta serpentina real con ruido de GPS de ±4 m
{
  const gj = JSON.parse(readFileSync('../../salidas/ruta_5m/ruta_serpentina.geojson', 'utf8'));
  const coords = gj.features[0].geometry.coordinates;
  const rf = new RouteFollower(coords);
  assert.ok(Math.abs(rf.length - gj.features[0].properties.largo_m) < 2.5, `largo ${rf.length}`);
  // Recorre la ruta cada 1 m con ruido determinista (pseudoaleatorio) de hasta 4 m perpendicular
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let wrong = 0, total = 0, maxBackJump = 0, prevS = 0;
  for (let s = 0; s < rf.length; s += 1) {
    const i = rf.segmentAt(s);
    const a = rf.xy[i], b = rf.xy[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = (s - rf.cum[i]) / L;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    const off = 2.4 * rnd(); // ruido lateral (±2,4 m, la mitad de la separación entre líneas)
    const x = a[0] + t * (b[0] - a[0]) - uy * off + 1.5 * rnd() * ux;
    const y = a[1] + t * (b[1] - a[1]) + ux * off + 1.5 * rnd() * uy;
    const st = rf.update(rf.plane.inv([x, y]));
    total++;
    if (st.segment - 1 !== i && Math.abs(st.chainage - s) > 6) wrong++;
    maxBackJump = Math.max(maxBackJump, prevS - st.chainage);
    prevS = st.chainage;
  }
  assert.ok(wrong / total < 0.01, `tramos equivocados ${wrong}/${total}`);
  ok(`serpentina (${rf.segments ?? rf.xy.length - 1} tramos, ${rf.length.toFixed(1)} m): ${wrong}/${total} lecturas en un tramo equivocado; retroceso máx. ${maxBackJump.toFixed(1)} m`);
}
// 6b. Error SESGADO: 3 m hacia la pasada siguiente + ruido de ±2 m (peor caso de un teléfono)
{
  const gj = JSON.parse(readFileSync('../../salidas/ruta_5m/ruta_serpentina.geojson', 'utf8'));
  const rf = new RouteFollower(gj.features[0].geometry.coordinates);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let jumps = 0, total = 0;
  for (let s = 0; s < rf.length; s += 1) {
    const i = rf.segmentAt(s);
    const a = rf.xy[i], b = rf.xy[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = (s - rf.cum[i]) / L;
    // sesgo fijo de 3 m hacia el este (hacia las pasadas siguientes) + ruido
    const x = a[0] + t * (b[0] - a[0]) + 3 + 2 * rnd();
    const y = a[1] + t * (b[1] - a[1]) + 2 * rnd();
    const st = rf.update(rf.plane.inv([x, y]));
    total++;
    if (Math.abs(st.chainage - s) > 10) jumps++; // ubicado en otra pasada, lejos del avance real
  }
  assert.equal(jumps, 0, `saltos ${jumps}/${total}`);
  ok(`con sesgo de 3 m hacia la pasada vecina: ${jumps}/${total} lecturas a más de 10 m del avance real`);
}
// 7. Signo del desvío y giro
{
  // Línea hacia el norte y luego al este
  const pl = localPlane(-83.593, 10.215);
  const A = pl.inv([0, 0]), B = pl.inv([0, 100]), C = pl.inv([100, 100]);
  const rf = new RouteFollower([A, B, C]);
  const st = rf.update(pl.inv([-3, 50])); // 3 m al oeste = izquierda
  assert.ok(Math.abs(st.xte - 3) < 0.01, `xte ${st.xte}`);
  assert.equal(st.correction, 'right');
  assert.equal(st.turn.dir, 'right');
  assert.equal(st.nextTurn.dir, 'right');
  assert.ok(Math.abs(st.nextTurn.dist - 50) < 0.01);
  assert.ok(Math.abs(st.chainage - 50) < 0.01);
  assert.ok(Math.abs(st.distAlongToVertex - 50) < 0.01);
  const st2 = rf.update(pl.inv([2, 60])); // 2 m al este = derecha
  assert.equal(st2.correction, 'left');
  ok('desvío 3 m a la izquierda → corregir a la derecha (códigos neutros); próximo giro a la derecha');
}
// 7b. Próximo giro de verdad: los vértices casi en línea recta (< 15°) no cuentan como giro
{
  const pl = localPlane(-83.593, 10.215);
  const A = pl.inv([0, 0]), B = pl.inv([0.5, 50]), C = pl.inv([0, 100]), D = pl.inv([-100, 100]);
  const rf = new RouteFollower([A, B, C, D]);
  const st = rf.update(pl.inv([0, 10]));
  assert.equal(st.turn.dir, 'straight');
  assert.equal(st.nextTurn.dir, 'left');
  assert.ok(Math.abs(st.nextTurn.dist - 90) < 0.1, `giro a ${st.nextTurn.dist}`);
  let end = st;
  for (let y = 12; y <= 100; y += 2) end = rf.update(pl.inv([0, y])); // camina la ruta (el ajuste avanza tramo a tramo)
  for (let x = -2; x >= -60; x -= 2) end = rf.update(pl.inv([x, 100.5]));
  assert.equal(end.nextTurn.dir, 'end');
  assert.ok(Math.abs(end.nextTurn.dist - 40) < 0.2, `fin a ${end.nextTurn.dist}`);
  ok('próximo giro: salta los vértices casi rectos y avisa el final de la ruta');
}
// 7c. Sentido contrario: caminar la línea al revés (rumbo opuesto, avance que baja)
{
  const pl = localPlane(-83.593, 10.215);
  const rf = new RouteFollower([pl.inv([0, 0]), pl.inv([0, 200])]);
  let st = rf.update(pl.inv([0.5, 150]));
  for (let y = 148; y > 130; y -= 1.3) st = rf.update(pl.inv([0.5, y]), {course: 180, speed: 1.3});
  assert.equal(st.wrongWay, true);
  for (let y = 131; y < 140; y += 1.3) st = rf.update(pl.inv([0.5, y]), {course: 0, speed: 1.3});
  assert.equal(st.wrongWay, false);
  // Parado (velocidad baja), sin rumbo fiable: no avisa
  const rf2 = new RouteFollower([pl.inv([0, 0]), pl.inv([0, 200])]);
  for (let k = 0; k < 10; k++) st = rf2.update(pl.inv([0.3, 100 - k * 0.1]), {course: 180, speed: 0.2});
  assert.equal(st.wrongWay, false);
  ok('sentido contrario: avisa tras 5 lecturas yendo al revés y se apaga al corregir');
}
// 7d. Líneas de ida y vuelta (planificador): «Línea k de n» y «cambio de línea»
{
  const gj = JSON.parse(readFileSync('../../salidas/ruta_5m/ruta_serpentina.geojson', 'utf8'));
  const rf = new RouteFollower(gj.features[0].geometry.coordinates);
  const n = (gj.features[0].geometry.coordinates.length) / 2;
  assert.ok(rf.lines && rf.lines.count === n, `líneas ${rf.lines && rf.lines.count}`);
  const a = rf.xy[2], b = rf.xy[3]; // tramo 3 = línea 2
  const st = rf.update(rf.plane.inv([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]));
  assert.equal(st.line, 2); assert.equal(st.lines, n); assert.equal(st.connector, false);
  // Una curva suave (todas las líneas en el mismo sentido) no es una ruta de líneas
  const pl = localPlane(-83.593, 10.215);
  const curve = [];
  for (let k = 0; k <= 10; k++) curve.push([Math.sin(k / 10) * 100, k * 30]);
  assert.equal(detectLines(curve), null);
  assert.equal(new RouteFollower(curve.map((p) => pl.inv(p))).lines, null);
  ok(`ruta de líneas de ida y vuelta: ${n} líneas reconocidas; una curva no se confunde`);
}
// 8. Secuencia de puntos
{
  const seq = new PointSequence([{ll: [-83.593, 10.215], name: 'P001'}, {ll: [-83.5929, 10.2151], name: 'P002'}]);
  const st = seq.update([-83.593, 10.21501], 3);
  assert.ok(st.arrived && st.distance < 1.2);
  seq.markVisited(); seq.next();
  assert.equal(seq.current.name, 'P002');
  ok('secuencia de puntos: llegada dentro del radio y avance');
}
console.log(`\n${n} pruebas superadas`);
