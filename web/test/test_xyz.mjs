// Mapas base XYZ como en QGIS (node test/test_xyz.mjs)
import assert from 'node:assert/strict';
import {parseXyzInput, parseQgisConnectionsXml, tileUrl, quadkey, makeConnection, escapeHtml, decodeBraces} from '../src/xyz.js';
import {setLang} from '../src/i18n.js';

const ok = (m) => console.log('  ok', m);

// 1. URL simple y con llaves codificadas
{
  const a = parseXyzInput('  https://tile.openstreetmap.org/{z}/{x}/{y}.png ');
  assert.deepEqual(a, {url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', zmin: 0, zmax: 19});
  const b = parseXyzInput('https://ejemplo.org/t/%7Bz%7D/%7Bx%7D/%7By%7D.jpg');
  assert.equal(b.url, 'https://ejemplo.org/t/{z}/{x}/{y}.jpg');
  ok('URL tal cual y con %7B…%7D');
}

// 2. Fuente de una capa XYZ de QGIS (url codificada, zmin/zmax)
{
  const src = 'type=xyz&url=https://ejemplo.org/wmts/tile?lyr%3Dsat%26x%3D%7Bx%7D%26y%3D%7By%7D%26z%3D%7Bz%7D&zmax=20&zmin=2';
  const c = parseXyzInput(src);
  assert.equal(c.url, 'https://ejemplo.org/wmts/tile?lyr=sat&x={x}&y={y}&z={z}');
  assert.equal(c.zmin, 2);
  assert.equal(c.zmax, 20);
  ok('fuente de capa de QGIS: type=xyz&url=…&zmax=20&zmin=2');
}

// 3. XML de «Guardar conexiones» de QGIS
{
  const xml = `<!DOCTYPE connections>
<qgsXYZTilesConnections version="1.0">
  <xyztiles zmin="0" url="https://a.ejemplo.org/{z}/{x}/{y}.png" password="" zmax="18" name="Ortofoto &amp; curvas" referer="" authcfg="" username=""/>
  <xyztiles name="Viejo http" url="http://inseguro.org/{z}/{x}/{y}.png" zmin="0" zmax="18"/>
  <xyztiles name='TMS' url='https://tms.ejemplo.org/%7Bz%7D/%7Bx%7D/%7B-y%7D.png' zmin='3' zmax='17'/>
</qgsXYZTilesConnections>`;
  const list = parseQgisConnectionsXml(xml);
  assert.equal(list.length, 2); // la conexión http se omite
  assert.deepEqual(list[0], {name: 'Ortofoto & curvas', url: 'https://a.ejemplo.org/{z}/{x}/{y}.png', zmin: 0, zmax: 18});
  assert.deepEqual(list[1], {name: 'TMS', url: 'https://tms.ejemplo.org/{z}/{x}/{-y}.png', zmin: 3, zmax: 17});
  assert.equal(parseXyzInput(xml).url, list[0].url); // pegar el XML en el campo URL usa la primera
  ok('XML de conexiones de QGIS: 2 válidas, http omitida, entidades y comillas simples');
}

// 4. Errores claros: cada uno con su código y con el mensaje en el idioma de la app
{
  const bad = [
    ['', 'EMPTY', /Escriba/],
    ['http://inseguro.org/{z}/{x}/{y}.png', 'HTTP', /http:\/\//],
    ['https://ejemplo.org/{z}/{x}.png', 'NO_MARKERS', /Faltan marcadores/],
    ['ftp://ejemplo.org/{z}/{x}/{y}', 'NOT_HTTPS', /https/],
    ['javascript:alert(1)//{z}{x}{y}', 'NOT_HTTPS', /https/],
    ['https://ejemplo.org/{z}/{x}/{y}/{foo}.png', 'BAD_MARKER', /no reconoce el marcador \{foo\}/],
    ['no es una url {z}{x}{y}', 'SPACES', /espacios/],
    ['type=xyz&zmax=19', 'NO_URL', /url=/],
    ['type=xyz&url=https://e.org/{z}/{x}/{y}&zmax=40', 'BAD_ZOOM', /zoom/],
  ];
  const code = (c) => (e) => e && e.code === c;
  for (const [txt, c] of bad) assert.throws(() => parseXyzInput(txt), code(c), txt);
  assert.throws(() => makeConnection({input: 'https://e.org/{z}/{x}/{y}', zmin: 15, zmax: 10}), code('ZOOM_ORDER'));
  // Mensajes: en español (la clave) y traducidos al francés, con los marcadores {x} {y} {z} intactos
  setLang('es');
  for (const [txt, , re] of bad) assert.throws(() => parseXyzInput(txt), re, txt);
  assert.throws(() => makeConnection({input: 'https://e.org/{z}/{x}/{y}', zmin: 15, zmax: 10}), /mínimo/);
  setLang('fr');
  assert.throws(() => parseXyzInput('https://ejemplo.org/{z}/{x}.png'), (e) => /\{x\}/.test(e.message) && !/Faltan/.test(e.message));
  setLang('en');
  ok(`${bad.length + 1} entradas inválidas rechazadas con su código y un mensaje traducido`);
}

// 5. URL de cada tesela
{
  assert.equal(tileUrl('https://t/{z}/{x}/{y}.png', 5, 10, 12), 'https://t/5/10/12.png');
  assert.equal(tileUrl('https://t/{z}/{x}/{-y}.png', 5, 10, 12), 'https://t/5/10/19.png'); // 2^5 − 1 − 12
  assert.equal(quadkey(3, 3, 5), '213'); // ejemplo de la documentación de Bing Maps
  assert.equal(tileUrl('https://t/{q}.jpg', 3, 3, 5), 'https://t/213.jpg');
  const subs = new Set();
  for (let x = 0; x < 8; x++) subs.add(tileUrl('https://mt{0-3}.e.org/{z}/{x}/{y}', 4, x, 0).split('.')[0]);
  assert.deepEqual([...subs].sort(), ['https://mt0', 'https://mt1', 'https://mt2', 'https://mt3']);
  assert.equal(tileUrl('https://{s}.t.org/{z}/{x}/{y}', 1, 1, 1), tileUrl('https://{s}.t.org/{z}/{x}/{y}', 1, 1, 1)); // estable
  assert.match(tileUrl('https://{a-c}.t.org/{z}/{x}/{y}', 2, 1, 0), /^https:\/\/[abc]\.t\.org\/2\/1\/0$/);
  ok('{x} {y} {-y} {z} {q} y subdominios {0-3}/{a-c}/{s} (siempre el mismo para la misma tesela)');
}

// 6. La atribución nunca se interpreta como HTML (podría venir de un XML ajeno)
{
  const c = makeConnection({name: 'X', input: 'https://e.org/{z}/{x}/{y}', attribution: '<img src=x onerror=alert(1)> © Yo'});
  assert.equal(escapeHtml(c.attribution), '&lt;img src=x onerror=alert(1)&gt; © Yo');
  assert.equal(decodeBraces('%7bz%7d'), '{z}');
  ok('atribución escapada antes de mostrarse');
}
console.log('\nMapas base XYZ: pruebas superadas');

// 7. QGIS: -1 = sin límite de zoom; conexiones inválidas se cuentan; una URL con type=xyz en la consulta sigue siendo URL
{
  const xml = `<qgsXYZTilesConnections version="1.0">
    <xyztiles name="Finca" url="https://a.example/{z}/{x}/{y}.png" zmin="-1" zmax="-1"/>
    <xyztiles name="Mal zoom" url="https://b.example/{z}/{x}/{y}.png" zmin="12" zmax="10"/>
    <xyztiles name="Sin marcadores" url="https://c.example/tiles.png"/>
  </qgsXYZTilesConnections>`;
  const list = parseQgisConnectionsXml(xml);
  assert.equal(list.length, 1);
  assert.deepEqual({...list[0]}, {name: 'Finca', url: 'https://a.example/{z}/{x}/{y}.png', zmin: 0, zmax: 19});
  assert.equal(list.skipped, 2);
  const u = parseXyzInput('https://srv.example/wms?layer=a&type=xyz&z={z}&x={x}&y={y}');
  assert.equal(u.url, 'https://srv.example/wms?layer=a&type=xyz&z={z}&x={x}&y={y}');
  assert.equal(parseXyzInput('type=xyz&url=https://e.org/%7Bz%7D/%7Bx%7D/%7By%7D&zmax=-1&zmin=-1').zmax, 19);
  console.log('  ok zoom -1 de QGIS = sin límite; 2 conexiones inválidas contadas; URL con type=xyz aceptada');
}
