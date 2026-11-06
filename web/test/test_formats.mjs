// Lectura de CSV (formato SingularPad sin encabezado: Nombre,N,E,Z,Código) y GeoJSON
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerAll} from '../src/crs.js';
import {readVector, toLL, crsHint, detectSeparator, toCSV, toGPX} from '../src/formats.js';
import {inverse} from '../src/geodesy.js';
import {setLang} from '../src/i18n.js';

registerAll();
const buf = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const ref = readFileSync('../../salidas/ruta_5m/puntos_levantamiento.csv', 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));

// 1. SingularPad CRTM05 (calculado por el script con EPSG:5367)
let asked = null;
const r = await readVector('puntos_CRTM05.csv', buf('../../salidas/ruta_5m/singularxyz/puntos_CRTM05.csv'), async (q) => { asked = q; return 'EPSG:5367'; });
assert.equal(r.features.length, 420);
assert.equal(asked.hint, 'EPSG:8908', 'la pista por nombre de archivo debe proponer CRTM05');
let maxErr = 0;
r.features.forEach((f, i) => {
  const ll = toLL(f.getGeometry().getCoordinates());
  const d = inverse(ll, [Number(ref[i][3]), Number(ref[i][2])]).distance;
  maxErr = Math.max(maxErr, d);
});
assert.ok(maxErr < 0.005, `error máx ${maxErr}`);
assert.equal(r.features[0].get('name'), 'P001');
assert.equal(r.features[0].get('code'), 'L1');
console.log(`  ok CSV SingularPad N,E sin encabezado: 420 puntos, error máx ${(maxErr * 1000).toFixed(2)} mm frente a lat/lon de referencia`);

// 2. UTM 17N sin encabezado
const u = await readVector('puntos_UTM17N.csv', buf('../../salidas/ruta_5m/singularxyz/puntos_UTM17N.csv'), async (q) => q.hint);
const ll0 = toLL(u.features[0].getGeometry().getCoordinates());
const d0 = inverse(ll0, [Number(ref[0][3]), Number(ref[0][2])]).distance;
assert.ok(d0 < 0.005, `UTM ${d0}`);
console.log(`  ok CSV UTM 17N (pista por nombre: EPSG:32617), P001 a ${(d0 * 1000).toFixed(2)} mm`);

// 3. CSV con encabezado lat/lon: no pregunta SRC
let askedLL = false;
const c = await readVector('puntos_levantamiento.csv', buf('../../salidas/ruta_5m/puntos_levantamiento.csv'), async () => { askedLL = true; return null; });
assert.equal(askedLL, false);
assert.equal(c.features.length, 420);
console.log('  ok CSV con columnas lat/lon: WGS 84 sin preguntar');

// 4. GeoJSON con crs CRS84
const g = await readVector('ruta_serpentina.geojson', buf('../../salidas/ruta_5m/ruta_serpentina.geojson'), async () => null);
assert.equal(g.crs, 'EPSG:4326');
assert.equal(g.features[0].getGeometry().getType(), 'LineString');
console.log('  ok GeoJSON (miembro crs CRS84 aceptado)');

// 5. CSV de Excel en español, francés y portugués: «;» o tabulador y coma decimal
const enc = (s) => new TextEncoder().encode(s).buffer;
const crtmRows = ref.slice(0, 5).map((r) => [`P${r[0]}`, r[7], r[6]]); // nombre, norte, este (CRTM05)
const llOf = (f) => toLL(f.getGeometry().getCoordinates());
const errVs = (feats) => Math.max(...feats.map((f, i) => inverse(llOf(f), [Number(ref[i][3]), Number(ref[i][2])]).distance));
{
  // Español: Nombre;N;E con coma decimal (la pista CRTM05 viene del nombre del archivo)
  const es = 'Nombre;N;E;Z\r\n' + crtmRows.map(([n, N, E]) => `${n};${N.replace('.', ',')};${E.replace('.', ',')};41,25`).join('\r\n');
  let q = null;
  const r1 = await readVector('replanteo_CRTM05.csv', enc(es), async (info) => { q = info; return 'EPSG:5367'; });
  assert.equal(r1.features.length, 5);
  assert.equal(q.hint, 'EPSG:8908');
  assert.ok(Math.abs(q.sample[0] - Number(crtmRows[0][2])) < 1e-6 && Math.abs(q.sample[1] - Number(crtmRows[0][1])) < 1e-6, 'muestra este, norte');
  assert.ok(errVs(r1.features) < 0.005, `es: ${errVs(r1.features)}`);
  assert.equal(r1.features[0].get('z'), 41.25);
  assert.equal(r1.features[0].get('name'), 'P1');
  // Francés: «sep=;» de Excel, encabezados nom;est;nord;altitude (m)
  const fr = 'sep=;\nnom;est;nord;altitude (m)\n' + crtmRows.map(([n, N, E]) => `${n};${E.replace('.', ',')};${N.replace('.', ',')};12,5`).join('\n');
  const r2 = await readVector('points.csv', enc(fr), async () => 'EPSG:5367');
  assert.ok(errVs(r2.features) < 0.005, `fr: ${errVs(r2.features)}`);
  assert.equal(r2.features[0].get('z'), 12.5);
  // Portugués (Brasil): tabulador, nome / leste / norte
  const pt = 'nome\tleste\tnorte\n' + crtmRows.map(([n, N, E]) => `${n}\t${E.replace('.', ',')}\t${N.replace('.', ',')}`).join('\n');
  const r3 = await readVector('pontos.txt', enc(pt), async () => 'EPSG:5367');
  assert.ok(errVs(r3.features) < 0.005, `pt: ${errVs(r3.features)}`);
  // Latitud/longitud con coma decimal: tantas comas como puntos y comas, gana «;»
  const ll = 'Punto;Latitud;Longitud\nP1;10,2155;-83,5929\nP2;10,2160;-83,5931';
  let asked = false;
  const r4 = await readVector('puntos.csv', enc(ll), async () => { asked = true; return null; });
  assert.equal(asked, false);
  assert.ok(Math.abs(llOf(r4.features[0])[1] - 10.2155) < 1e-9 && Math.abs(llOf(r4.features[0])[0] + 83.5929) < 1e-9);
  // Sin encabezado: «P1;10,2155;-83,5929»
  const r5 = await readVector('puntos.csv', enc('P1;10,2155;-83,5929\nP2;10,2160;-83,5931'), async () => null);
  assert.equal(r5.crs, 'EPSG:4326');
  assert.ok(Math.abs(llOf(r5.features[1])[0] + 83.5931) < 1e-9);
  assert.equal(detectSeparator(['P1;10,2155;-83,5929']), ';');
  assert.equal(detectSeparator(['P001,1129535.023,544592.110,0.000,L1']), ',');
  console.log('  ok CSV de Excel: es (;), fr (sep=; y altitude (m)), pt (tabulador) y lat/lon con coma decimal');
}

// 6. Filas malas, cancelar y GeoJSON con un código desconocido
{
  const bad = 'lat,lon\n10.1,-83.1\nx,y\n10.2,-83.2';
  const r = await readVector('a.csv', enc(bad), async () => null);
  assert.equal(r.features.length, 2);
  assert.equal(r.warnings.length, 1);
  await assert.rejects(readVector('b.csv', enc('E,N\n500000,1100000'), async () => null), (e) => e.code === 'CANCELLED');
  const gj = JSON.stringify({type: 'FeatureCollection', crs: {type: 'name', properties: {name: 'urn:ogc:def:crs:EPSG::3400'}}, features: [{type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: [100000, 6000000]}}]});
  let info = null;
  await assert.rejects(readVector('c.geojson', enc(gj), async (q) => { info = q; return null; }), (e) => e.code === 'CANCELLED');
  assert.equal(info.unknownCode, 'EPSG:3400');
  assert.deepEqual(info.sample, [100000, 6000000]);
  await assert.rejects(readVector('d.shp', enc('x'), async () => null), (e) => e.code === 'FORMAT');
  // Un GeoJSON en ETRS89 / UTM 32N (código del catálogo nuevo) se lee sin preguntar
  const gj2 = JSON.stringify({type: 'FeatureCollection', crs: {type: 'name', properties: {name: 'EPSG:25832'}}, features: [{type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: [500000, 5500000]}}]});
  const r2 = await readVector('e.geojson', enc(gj2), async () => { throw new Error('no debía preguntar'); });
  assert.equal(r2.crs, 'EPSG:25832');
  assert.ok(Math.abs(llOf(r2.features[0])[0] - 9) < 1e-6, 'meridiano central de la zona 32');
  console.log('  ok filas sin coordenadas, cancelar (código CANCELLED), EPSG desconocido y ETRS89 / UTM 32N');
}

// 7. Pistas de sistema de coordenadas por nombre de archivo o de columna
{
  const cases = [
    ['puntos_CRTM05.csv', 'EPSG:8908'], ['puntos_UTM17N.csv', 'EPSG:32617'], ['levantamiento_EPSG_25832.csv', 'EPSG:25832'],
    ['datos utm zone 33s.csv', 'EPSG:32733'], ['ETRS89_UTM32N.csv', 'EPSG:25832'], ['NAD83 UTM 17N.csv', 'EPSG:26917'],
    ['SIRGAS2000_UTM23S.csv', 'EPSG:31983'], ['parcelles_Lambert93.csv', 'EPSG:2154'], ['survey_BNG.csv', 'EPSG:27700'],
    ['punten RD_New.csv', 'EPSG:28992'], ['pontos_MGA55.csv', 'EPSG:7855'], ['GDA94 MGA 56.csv', 'EPSG:28356'],
    ['E_UTM_WGS84 N_UTM_WGS84', null], ['plantas.csv', null], ['lat lon', 'EPSG:4326'], ['finca_2019.csv', null],
  ];
  for (const [txt, want] of cases) assert.equal(crsHint(txt), want, txt);
  console.log(`  ok ${cases.length} pistas de SRC (EPSG escrito, zona UTM con datum, sistemas nacionales)`);
}

// 8. Lo exportado no depende del idioma: claves fijas y punto decimal
{
  setLang('fr');
  const w = [{name: 'P1', lat: 10.5, lon: -83.25, acc: 1.25, alt: 40.5, time: 0, avgN: 3}];
  const csv = toCSV(w, {utm: () => ({zone: '17N', e: 500000.123, n: 1100000.456}), crtm05: () => null});
  assert.match(csv, /^﻿nombre,lat_WGS84,lon_WGS84/);
  assert.match(csv, /10\.50000000,-83\.25000000,17N,500000\.123,1100000\.456/);
  const gpx = toGPX({waypoints: w});
  assert.match(gpx, /<wpt lat="10\.50000000" lon="-83\.25000000">/);
  assert.match(gpx, /±1\.3 m|±1\.2 m/);
  setLang('es');
  console.log('  ok exportación CSV/GPX con punto decimal y claves fijas en cualquier idioma');
}

// 9. Número de punto en la primera columna (sin encabezado) y columna del nombre por prioridad
{
  // SingularPad con nombres numéricos: «1,N,E,Z,Código»
  const sp = crtmRows.map(([, N, E], i) => `${i + 1},${N},${E},41.200,ESQ`).join('\n');
  let q = null;
  const r1 = await readVector('sp_CRTM05.csv', enc(sp), async (info) => { q = info; return 'EPSG:5367'; });
  assert.equal(r1.features.length, 5);
  assert.ok(Math.abs(q.sample[0] - Number(crtmRows[0][2])) < 1e-6 && Math.abs(q.sample[1] - Number(crtmRows[0][1])) < 1e-6, 'muestra este, norte');
  assert.ok(errVs(r1.features) < 0.005, `id,N,E: ${errVs(r1.features)}`);
  assert.equal(r1.features[0].get('name'), '1');
  assert.equal(r1.features[0].get('code'), 'ESQ');
  assert.equal(r1.features[0].get('z'), 41.2);
  // «id,lat,lon» sin encabezado
  const idll = ref.slice(0, 5).map((r, i) => `${i + 1},${r[2]},${r[3]}`).join('\n');
  const r2 = await readVector('puntos.csv', enc(idll), async () => { throw new Error('no debía preguntar'); });
  assert.equal(r2.crs, 'EPSG:4326');
  assert.ok(errVs(r2.features) < 0.001, `id,lat,lon: ${errVs(r2.features)}`);
  assert.equal(r2.features[4].get('name'), '5');
  assert.equal(r2.features[0].get('code'), undefined);
  // «id,lon,lat» con longitud de más de 90°
  const r3 = await readVector('puntos.csv', enc('7,-120.5,45.25\n8,-120.6,45.3'), async () => null);
  assert.ok(Math.abs(llOf(r3.features[0])[0] + 120.5) < 1e-9 && Math.abs(llOf(r3.features[0])[1] - 45.25) < 1e-9);
  assert.equal(r3.features[1].get('name'), '8');
  // Coordenadas enteras en metros: la primera columna sigue siendo coordenada
  let s4 = null;
  await readVector('b.csv', enc('50000,544663,41\n50010,544670,42'), async (info) => { s4 = info.sample; return null; }).catch(() => null);
  assert.deepEqual(s4, [544663, 50000], 'N,E,Z enteros');
  let s5 = null;
  await readVector('c.csv', enc('544663,1129531,41\n544670,1129540,42'), async (info) => { s5 = info.sample; return null; }).catch(() => null);
  assert.deepEqual(s5, [544663, 1129531], 'E,N,Z enteros');
  // Con encabezado: «id,name,lat,lon» toma el nombre, no el id
  const r6 = await readVector('pozos.csv', enc('id,name,lat,lon\n7,Pozo norte,10.2148,-83.5929\n8,Pozo sur,10.2150,-83.5930'), async () => null);
  assert.deepEqual(r6.features.map((f) => f.get('name')), ['Pozo norte', 'Pozo sur']);
  const r7 = await readVector('p.csv', enc('id;punto;x;y\n1;P12;544663,8;1129531,4'), async () => 'EPSG:5367');
  assert.equal(r7.features[0].get('name'), 'P12');
  const r8 = await readVector('p.csv', enc('id,lat,lon\n7,10.2148,-83.5929'), async () => null);
  assert.equal(r8.features[0].get('name'), '7');
  console.log('  ok número de punto en la 1.ª columna (id,N,E,Z,Código · id,lat,lon · id,lon,lat) y nombre antes que id');
}
console.log('\nFormatos: pruebas superadas');
