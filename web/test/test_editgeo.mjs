// Funciones de edición (node test/test_editgeo.mjs)
import assert from 'node:assert/strict';
import {registerAll, localPlane} from '../src/crs.js';
import {nextName, nextNumericId, renumberNames, parseAngle, parseNumber, pointAtDistanceBearing, splitLineCoords, fieldsOf, coerceValue, cleanFieldName, isNumberText, toBool, sourceCode, safeFileName, isoDate, averageFixes} from '../src/editgeo.js';
import {inverse} from '../src/geodesy.js';

registerAll();
const ok = (m) => console.log('  ok', m);

// 1. Nombres automáticos
assert.equal(nextName(['P001', 'P002', 'P420']), 'P421');
assert.equal(nextName(['Línea 1', 'Línea 2', 'Línea 17', 'Recorrido del plan']), 'Línea 18');
assert.equal(nextName([], 'L'), 'L001');
assert.equal(nextName(['A9', 'P001', 'P002']), 'P003'); // gana la serie más común
assert.equal(nextName(['P0099']), 'P0100');
assert.equal(nextNumericId([1, 2, 3, 420]), 421);
assert.equal(nextNumericId([1, 'a']), null);
assert.deepEqual(renumberNames(3, 'P', 1), ['P1', 'P2', 'P3']);
assert.deepEqual(renumberNames(3, 'P', 1, 3), ['P001', 'P002', 'P003']);
assert.equal(renumberNames(120, 'M', 1).at(-1), 'M120');
assert.equal(renumberNames(120, 'M', 1)[0], 'M001');
ok('nombres automáticos (P421, Línea 18) y renumeración con ancho fijo');

// 2. Ángulos escritos
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
near(parseAngle('10.2148', 'lat'), 10.2148);
near(parseAngle('-83,5930', 'lon'), -83.593);
near(parseAngle(`10°12'53.5"N`, 'lat'), 10 + 12 / 60 + 53.5 / 3600);
near(parseAngle('83 35 34.7 O', 'lon'), -(83 + 35 / 60 + 34.7 / 3600));
near(parseAngle('83 35 34.7 W', 'lon'), -(83 + 35 / 60 + 34.7 / 3600));
near(parseAngle('10 12.5 S', 'lat'), -(10 + 12.5 / 60));
near(parseAngle('S 10 12 30', 'lat'), -(10 + 12.5 / 60));
for (const [t, k] of [['95', 'lat'], ['10 61 0', 'lat'], ['10.5 30', 'lat'], ['10 N', 'lon'], ['83 E', 'lat'], ['abc', 'lat'], ['', 'lon'], ['181', 'lon']]) assert.throws(() => parseAngle(t, k), undefined, t);
near(parseNumber('1 129 456,789', 'N'), 1129456.789);
assert.throws(() => parseNumber('12a', 'E'));
ok('grados decimales y GMS con N/S/E/O/W, coma decimal; 8 entradas inválidas rechazadas');

// 3. Punto a distancia y rumbo (comparado con el inverso de Vincenty)
for (const [d, az] of [[25, 90], [100, 0], [250, 225.5], [1000, 33.3]]) {
  const o = [-83.5935, 10.2155];
  const p = pointAtDistanceBearing(o, d, az);
  const inv = inverse(o, p);
  assert.ok(Math.abs(inv.distance - d) < 0.002, `d ${inv.distance} vs ${d}`);
  const daz = Math.abs(((inv.azimuth1 ?? inv.azimuth ?? inv.az1) - az + 540) % 360 - 180);
  assert.ok(daz < 0.001, `az ${JSON.stringify(inv)} vs ${az}`);
}
ok('distancia y rumbo: 25–1000 m, error < 2 mm y < 0.001° frente a Vincenty');

// 4. Cortar una línea
{
  const line = [[0, 0], [10, 0], [10, 10]];
  const [a, b, d] = splitLineCoords(line, [4, 0.5]);
  assert.deepEqual(a, [[0, 0], [4, 0]]);
  assert.deepEqual(b, [[4, 0], [10, 0], [10, 10]]);
  near(d, 0.5);
  const [c, e] = splitLineCoords(line, [10.2, 0]); // justo en el vértice intermedio
  assert.deepEqual(c, [[0, 0], [10, 0]]);
  assert.deepEqual(e, [[10, 0], [10, 10]]);
  assert.equal(splitLineCoords(line, [-3, 0]), null); // en el extremo inicial
  assert.equal(splitLineCoords(line, [10, 12]), null); // en el extremo final
}
ok('cortar líneas: en un tramo, en un vértice; en los extremos no corta');

// 5. Campos y valores
assert.deepEqual(fieldsOf([{nombre: 'P1', id: 1, geometry: {}}, {nombre: 'P2', linea: 3, obj: {a: 1}}]), ['nombre', 'id', 'linea']);
assert.equal(coerceValue('12,5', true), 12.5);
assert.equal(coerceValue('12,5', false), '12,5');
assert.equal(coerceValue('  ', true), null);
assert.equal(coerceValue('abc', true), 'abc');
assert.equal(coerceValue('1.234,5', true), 1234.5);
assert.equal(coerceValue('1,234.5', true), 1234.5);
assert.equal(isNumberText('12,5'), true);
assert.equal(isNumberText(''), true);
assert.equal(isNumberText('doce'), false);
assert.equal(cleanFieldName('Profundidad (cm)'), 'Profundidad_cm');
// letras de cualquier idioma: no se quitan tildes ni se pierden escrituras no latinas
assert.equal(cleanFieldName('pH año'), 'pH_año');
assert.equal(cleanFieldName('深度 (cm)'), '深度_cm');
assert.equal(cleanFieldName('गहराई'), 'गहराई');
assert.equal(cleanFieldName('عمق التربة'), 'عمق_التربة');
assert.equal(cleanFieldName('x'.repeat(50)).length, 40);
assert.throws(() => cleanFieldName('  '));
assert.throws(() => cleanFieldName('(  )'));
assert.throws(() => cleanFieldName('geometry'));
ok('campos, números con coma o punto y nombres de campo en cualquier escritura');

// 5b. Sí/no en los cuatro idiomas, códigos de «fuente» y nombres de archivo
for (const w of ['sí', 'Si', 'yes', 'OUI', 'sim', 'true', '1', 'verdadero', 'vrai']) assert.equal(toBool(w), true, w);
for (const w of ['no', 'Non', 'não', 'nao', 'false', '0', 'falso', 'faux']) assert.equal(toBool(w), false, w);
assert.equal(toBool('  '), null);
assert.equal(toBool('quizás'), 'quizás');
assert.equal(sourceCode('gps_avg'), 'gps_avg');
assert.equal(sourceCode('GPS'), 'gps'); // versiones anteriores
assert.equal(sourceCode('mapa'), 'map');
assert.equal(sourceCode('coordenadas'), 'coords');
assert.equal(sourceCode('GPS promediado 10 s'), 'gps_avg');
assert.equal(sourceCode('distancia y rumbo (25 m, 90°)'), 'bearing');
assert.equal(sourceCode('dron DJI'), null);
assert.equal(sourceCode(null), null);
assert.equal(safeFileName('Muestras de suelo 2026'), 'Muestras_de_suelo_2026');
assert.equal(safeFileName('Échantillons çà'), 'Échantillons_çà');
assert.equal(safeFileName('样品 / 区域'), '样品_区域');
assert.equal(safeFileName('???'), 'layer');
assert.equal(isoDate(new Date(2026, 10, 5, 23, 59)), '2026-11-05');
ok('sí/no en es/en/fr/pt, códigos de fuente (y valores antiguos) y nombres de archivo Unicode');

// 5c. Promedio de lecturas GPS: ponderado por precisión, con dispersión
{
  const o = [-83.5935, 10.2155];
  const pl = localPlane(o[0], o[1]);
  const at = (x, y, acc, alt) => {
    const [lon, lat] = pl.inv([x, y]);
    return {lon, lat, acc, alt};
  };
  const r = averageFixes([at(-1, 0, 2, 40), at(1, 0, 2, 42), at(0, 3, 2, null)]);
  const [x, y] = pl.fwd([r.lon, r.lat]);
  near(x, 0, 1e-6);
  near(y, 1, 1e-6);
  near(r.alt, 41, 1e-9);
  near(r.acc, 2, 1e-9);
  assert.equal(r.n, 3);
  near(r.spread, Math.sqrt((2 + 2 + 4) / 3), 1e-6);
  const w = averageFixes([at(0, 0, 1), at(10, 0, 10)]); // la lectura precisa pesa 100 veces más
  near(pl.fwd([w.lon, w.lat])[0], 10 / 101, 1e-6);
  assert.equal(averageFixes([]), null);
}
ok('promedio GPS: media ponderada 1/σ², altura y dispersión');
console.log('\nEdición: pruebas superadas');

// 6. Cortar una línea con Z (KML y RTK traen altura): el punto de corte interpola la Z
{
  const line3 = [[0, 0, 10], [10, 0, 20], [10, 10, 30]];
  const [a, b] = splitLineCoords(line3, [4, 0.5]);
  assert.deepEqual(a, [[0, 0, 10], [4, 0, 14]]);
  assert.deepEqual(b, [[4, 0, 14], [10, 0, 20], [10, 10, 30]]);
  assert.ok(a.every((c) => c.length === 3 && c.every(Number.isFinite)));
  console.log('  ok cortar una línea 3D: la Z del corte se interpola (14 m entre 10 y 20)');
}
