// Sistemas de coordenadas del mundo (node test/test_crs.mjs)
import assert from 'node:assert/strict';

// localStorage de prueba (los sistemas propios se guardan ahí)
const mem = new Map();
globalThis.localStorage = {getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k)};

const crs = await import('../src/crs.js');
const {CRS, registerAll, isKnown, fromWgs84, toWgs84, normalizeCode, suggestCrs, crsIndex, crsMatches, validateProjDef, addCustomCrs, removeCustomCrs, crsName, crsDescription, isCostaRicaCrs, inCrsArea} = crs;
const {setLang} = await import('../src/i18n.js');
const ok = (m) => console.log('  ok', m);

const t0 = Date.now();
registerAll();
const n = Object.keys(CRS).length;
assert.ok(n > 250, `catálogo con ${n} sistemas`);
ok(`${n} sistemas registrados en proj4 y OpenLayers en ${Date.now() - t0} ms`);

// 1. Cada familia UTM: el código, el nombre y la zona de la definición coinciden
{
  let checked = 0;
  for (const [code, info] of Object.entries(CRS)) {
    if (!/\+proj=utm/.test(info.def) || info.region === 'costa-rica') continue;
    const z = Number(/\+zone=(\d+)/.exec(info.def)[1]);
    const south = /\+south/.test(info.def);
    const m = /(?:UTM|MGA) zone (\d+)([NS]?)$/.exec(info.name);
    assert.ok(m, `${code} ${info.name}`);
    assert.equal(Number(m[1]), z, `${code}: zona del nombre`);
    if (m[2]) assert.equal(m[2] === 'S', south, `${code}: hemisferio`);
    // El meridiano central de la zona da E = 500 000 m (±3 m: NAD83(CSRS) lleva su cambio de datum)
    const lon0 = -183 + z * 6;
    const [e] = fromWgs84(code, [lon0, south ? -10 : 10]);
    // Arc 1960 se aparta decenas de metros de WGS 84 (su cambio de datum); el resto, menos de 3 m
    const shift = /towgs84=([^ ]+)/.exec(info.def);
    const big = shift && shift[1].split(',').slice(0, 3).some((v) => Math.abs(Number(v)) > 5);
    assert.ok(Math.abs(e - 500000) < (big ? 200 : 3), `${code}: E en el meridiano central = ${e}`);
    checked++;
  }
  // Códigos conocidos (EPSG): una muestra de cada familia
  const names = {
    'EPSG:32617': 'WGS 84 / UTM zone 17N', 'EPSG:32733': 'WGS 84 / UTM zone 33S', 'EPSG:25832': 'ETRS89 / UTM zone 32N', 'EPSG:26917': 'NAD83 / UTM zone 17N',
    'EPSG:2958': 'NAD83(CSRS) / UTM zone 17N', 'EPSG:3154': 'NAD83(CSRS) / UTM zone 7N', 'EPSG:3761': 'NAD83(CSRS) / UTM zone 22N', 'EPSG:2955': 'NAD83(CSRS) / UTM zone 11N',
    'EPSG:6330': 'NAD83(2011) / UTM zone 1N', 'EPSG:6340': 'NAD83(2011) / UTM zone 11N', 'EPSG:6348': 'NAD83(2011) / UTM zone 19N', 'EPSG:6328': 'NAD83(2011) / UTM zone 59N',
    'EPSG:31983': 'SIRGAS 2000 / UTM zone 23S', 'EPSG:31971': 'SIRGAS 2000 / UTM zone 17N', 'EPSG:28355': 'GDA94 / MGA zone 55', 'EPSG:7846': 'GDA2020 / MGA zone 46',
    'EPSG:6367': 'Mexico ITRF2008 / UTM zone 12N', 'EPSG:21037': 'Arc 1960 / UTM zone 37S', 'EPSG:21097': 'Arc 1960 / UTM zone 37N', 'EPSG:5343': 'POSGAR 2007 / Argentina 1',
    'EPSG:5349': 'POSGAR 2007 / Argentina 7',
  };
  for (const [code, name] of Object.entries(names)) assert.equal(CRS[code] && CRS[code].name, name, code);
  ok(`${checked} zonas UTM/MGA coherentes (código, nombre, zona y hemisferio); ${Object.keys(names).length} códigos comprobados con epsg.io`);
}

// 2. Puntos de referencia (orígenes de cada sistema y puntos publicados)
{
  const near = (a, b, tol, what) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < tol, `${what}: ${a.map((v) => v.toFixed(3))} ≠ ${b}`);
  near(fromWgs84('EPSG:2154', [3, 46.5]), [700000, 6600000], 0.01, 'Lambert-93');
  near(fromWgs84('EPSG:2157', [-8, 53.5]), [600000, 750000], 0.01, 'ITM');
  near(fromWgs84('EPSG:3763', [-8.13310833333333, 39.6682583333333]), [0, 0], 0.01, 'PT-TM06');
  near(fromWgs84('EPSG:9377', [-73, 4]), [5000000, 2000000], 0.01, 'Origen Nacional');
  near(fromWgs84('EPSG:6372', [-102, 12]), [2500000, 0], 0.01, 'México LCC');
  near(fromWgs84('EPSG:3812', [4.35921583333333, 50.797815]), [649328, 665262], 0.01, 'Lambert 2008');
  near(fromWgs84('EPSG:2193', [173, 0]), [1600000, 10000000], 0.01, 'NZTM');
  // Datums con cambio de Helmert: origen en WGS 84 según swisstopo / Kadaster, y Caister (Ordnance Survey)
  near(toWgs84('EPSG:2056', [2600000, 1200000]), [7.438632, 46.951083], 2e-5, 'LV95 (Berna)');
  near(toWgs84('EPSG:28992', [155000, 463000]), [5.387206, 52.155174], 1e-5, 'RD New (Amersfoort)');
  near(fromWgs84('EPSG:27700', [1 + 42 / 60 + 57.8663 / 3600, 52 + 39 / 60 + 28.8282 / 3600]), [651409.903, 313177.27], 5, 'BNG (Caister, ±5 m sin OSTN15)');
  // Ida y vuelta en todo el catálogo, en el centro de la zona de uso
  let worst = 0;
  for (const [code, info] of Object.entries(CRS)) {
    const a = info.area;
    if (!a) continue;
    const ll = [(a[0] + a[2]) / 2, Math.max(-80, Math.min(80, (a[1] + a[3]) / 2))];
    const back = toWgs84(code, fromWgs84(code, ll));
    worst = Math.max(worst, Math.abs(back[0] - ll[0]), Math.abs(back[1] - ll[1]));
  }
  assert.ok(worst < 1e-6, `ida y vuelta ${worst}`);
  ok(`orígenes de Lambert-93, ITM, PT-TM06, Origen Nacional, México, Bélgica, NZTM; LV95, RD y BNG con su datum; ida y vuelta < ${worst.toExponential(1)}°`);
}

// 3. Códigos
{
  assert.equal(normalizeCode('urn:ogc:def:crs:EPSG::25832'), 'EPSG:25832');
  assert.equal(normalizeCode('urn:ogc:def:crs:EPSG:6.6:4326'), 'EPSG:4326');
  assert.equal(normalizeCode('http://www.opengis.net/def/crs/EPSG/0/2154'), 'EPSG:2154');
  assert.equal(normalizeCode('urn:ogc:def:crs:OGC:1.3:CRS84'), 'EPSG:4326');
  assert.equal(normalizeCode(27700), 'EPSG:27700');
  assert.equal(normalizeCode('user:3'), 'USER:3');
  assert.equal(normalizeCode('lo que sea'), null);
  for (const c of ['EPSG:25832', 'EPSG:2154', 'EPSG:27700', 'EPSG:7855', 'EPSG:6372', 'EPSG:9377', 'EPSG:8908', 'EPSG:3857']) assert.ok(isKnown(c), c);
  assert.equal(isKnown('EPSG:3400'), false);
  ok('códigos EPSG en todas sus formas (urn, URL, CRS84, número)');
}

// 4. Sugerencias: nunca Costa Rica fuera de Costa Rica
{
  const fr = suggestCrs({sample: [652469, 6862035], lonLat: [2.35, 48.85]});
  assert.equal(fr.pick, 'EPSG:2154');
  assert.ok(fr.list.some((x) => x.code === 'EPSG:25831') && fr.list.some((x) => x.code === 'EPSG:32631'));
  const ke = suggestCrs({sample: [257538, 9857382], lonLat: [36.82, -1.29]});
  assert.ok(['EPSG:21037', 'EPSG:32737'].includes(ke.pick), ke.pick);
  const au = suggestCrs({lonLat: [151.2, -33.9], sample: [334000, 6252000]});
  assert.equal(au.pick, 'EPSG:7856');
  // Llamada antigua de main.js: la pista EPSG:8908 «por defecto» no se elige fuera de Costa Rica
  const legacy = suggestCrs({hint: 'EPSG:8908', legacy: true, sample: [500000, 5500000], lonLat: [9, 49.6]});
  assert.ok(!legacy.pick || !isCostaRicaCrs(legacy.pick), `legacy ${legacy.pick}`);
  assert.ok(!legacy.list.some((x) => isCostaRicaCrs(x.code)));
  const none = suggestCrs({hint: 'EPSG:8908', legacy: true});
  assert.equal(none.pick, null);
  // En Costa Rica sí, y si el archivo lo dice (llamada nueva) también
  const cr = suggestCrs({sample: [544592.11, 1129535.02], lonLat: [-83.59, 10.21]});
  assert.equal(cr.pick, 'EPSG:8908');
  assert.equal(suggestCrs({hint: 'EPSG:8908'}).pick, 'EPSG:8908');
  // Latitud/longitud en la muestra
  assert.equal(suggestCrs({sample: [-83.59, 10.21]}).pick, 'EPSG:4326');
  // Ningún sistema de Costa Rica en ninguna sugerencia lejos de allí
  for (const ll of [[-74, 4.6], [-46.6, -23.5], [77.2, 28.6], [-0.1, 51.5], [139.7, 35.7], [-122.4, 37.8]]) {
    const s = suggestCrs({lonLat: ll, sample: [500000, 1000000]});
    assert.ok(!s.list.some((x) => isCostaRicaCrs(x.code)), `CR sugerido en ${ll}`);
    assert.ok(s.list.some((x) => x.code === crs.utmCodeFor(ll[0], ll[1])), `UTM de ${ll}`);
  }
  ok('sugerencias: Lambert-93 en París, Arc 1960 en Nairobi, MGA 56 en Sídney, CRTM05 solo en Costa Rica o si el archivo lo dice');
}

// 5. Búsqueda en cualquier idioma
{
  const idx = crsIndex();
  const find = (q) => idx.filter((e) => crsMatches(e, q)).map((e) => e.code);
  assert.deepEqual(find('lambert 93'), ['EPSG:2154']);
  assert.ok(find('France').includes('EPSG:2154'), 'en inglés');
  assert.ok(find('Francia').includes('EPSG:2154'), 'en español');
  assert.ok(find('Suisse').includes('EPSG:2056'), 'en francés');
  assert.ok(find('Países Baixos').includes('EPSG:28992') || find('Paises Bajos').includes('EPSG:28992'));
  assert.deepEqual(find('27700'), ['EPSG:27700']);
  assert.deepEqual(find('EPSG: 25832'), ['EPSG:25832']);
  assert.deepEqual(find('zona 33N').sort(), ['EPSG:25833', 'EPSG:32633']);
  assert.ok(find('zone 18S').includes('EPSG:32718') && find('zone 18S').includes('EPSG:31978'));
  assert.ok(find('mga 55').includes('EPSG:7855') && find('mga 55').includes('EPSG:28355'));
  assert.deepEqual(find('no existe nada'), []);
  ok('búsqueda por nombre, país (es/en/fr/pt), código EPSG y zona UTM');
}

// 6. Sistemas propios (definición PROJ pegada por el usuario)
{
  const bad = [['', 'EMPTY'], ['hola', 'INVALID'], ['+proj=foo +x=1', 'INVALID'], ['+proj=tmerc +lat_0=49 +lon_0=-2 +ellps=airy +nadgrids=OSTN15.gsb', 'GRID']];
  for (const [d, code] of bad) assert.throws(() => validateProjDef(d), (e) => e.code === code, d);
  assert.throws(() => addCustomCrs({def: '+proj=utm +zone=33 +datum=WGS84', epsg: '2154'}), (e) => e.code === 'EXISTS');
  assert.throws(() => addCustomCrs({def: '+proj=utm +zone=33 +datum=WGS84', epsg: 'abc'}), (e) => e.code === 'BAD_CODE');
  // EPSG:3400 (NAD83 / Alberta 10-TM (Forest)), que no está en el catálogo
  const def3400 = '+proj=tmerc +lat_0=0 +lon_0=-115 +k=0.9992 +x_0=500000 +y_0=0 +datum=NAD83 +units=m +no_defs';
  const code = addCustomCrs({def: def3400, name: 'Alberta 10-TM', epsg: '3400'}, {sample: [500000, 5900000]});
  assert.equal(code, 'EPSG:3400');
  assert.ok(isKnown('EPSG:3400'));
  assert.equal(crsName('EPSG:3400'), 'Alberta 10-TM');
  assert.ok(CRS['EPSG:3400'].custom);
  const ll = toWgs84('EPSG:3400', [500000, 5900000]);
  assert.ok(Math.abs(ll[0] + 115) < 1e-9 && ll[1] > 53 && ll[1] < 53.4);
  const saved = JSON.parse(mem.get('mc.crs.custom.v1'));
  assert.deepEqual(saved.map((x) => x.code), ['EPSG:3400']);
  // Sin código: USER:1; WKT también vale
  const wkt = 'PROJCS["WGS 84 / UTM zone 33N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",15],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1]]';
  const u = addCustomCrs({def: wkt});
  assert.equal(u, 'USER:1');
  assert.equal(crsName(u), 'WGS 84 / UTM zone 33N');
  assert.ok(Math.abs(fromWgs84(u, [15, 45])[0] - 500000) < 1e-6);
  assert.ok(crsIndex().some((e) => e.code === u && crsMatches(e, 'propio')));
  assert.ok(crsDescription(u).length > 0);
  // Borrar
  assert.equal(removeCustomCrs(u), true);
  assert.equal(CRS[u], undefined);
  assert.equal(removeCustomCrs('EPSG:2154'), false, 'no se borra un sistema del catálogo');
  assert.deepEqual(JSON.parse(mem.get('mc.crs.custom.v1')).map((x) => x.code), ['EPSG:3400']);
  ok('sistemas propios: validación (vacío, inválido, cuadrícula, código repetido), EPSG:3400 guardado y reconocido, WKT, borrar');
}

// 7. Textos traducidos (los nombres oficiales no cambian)
{
  setLang('fr');
  assert.equal(crsName('EPSG:2154'), 'RGF93 v1 / Lambert-93');
  assert.equal(crsDescription('EPSG:2154'), 'France métropolitaine et Corse');
  assert.match(crsDescription('EPSG:32633'), /^UTM zone 33N · longitude 12° à 18°$/);
  setLang('pt');
  assert.match(crsDescription('EPSG:31983'), /UTM zona 23S/);
  setLang('es');
  assert.match(crs.unknownCrsHelp('EPSG:3400'), /EPSG:3400/);
  assert.ok(inCrsArea('EPSG:2154', [2.35, 48.85]) && !inCrsArea('EPSG:2154', [-83.6, 10.2]));
  ok('descripciones traducidas (fr, pt) y nombres oficiales sin traducir');
}
console.log('\nSistemas de coordenadas: pruebas superadas');
