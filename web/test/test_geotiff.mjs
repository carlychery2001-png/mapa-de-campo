// Comprueba la esquina de origen de GeoTIFF frente a GDAL (node test/test_geotiff.mjs)
import assert from 'node:assert/strict';
import {fromFile} from 'geotiff';
import {cornerOrigin} from '../src/geotiff_patch.js';

// 1. Fórmula: punto de enlace con I,J ≠ 0 y PixelIsPoint
assert.deepEqual(cornerOrigin([10, 20, 0, 1000, 5000, 0], [2, 2, 0], null, false), [980, 5040, 0]);
assert.deepEqual(cornerOrigin([0, 0, 0, 1001, 4999, 0], [2, 2, 0], null, true), [1000, 5000, 0]);
assert.deepEqual(cornerOrigin(null, null, [2, 0, 0, 1001, 0, -2, 0, 4999, 0, 0, 0, 0, 0, 0, 0, 1], true), [1000, 5000, 0]);
console.log('  ok fórmula de la esquina (I,J y PixelIsPoint)');

// 2. Archivos reales escritos por GDAL 3.12 (bounds de rasterio como referencia)
const cases = [
  ['../test_data/prueba_PixelIsPoint_UTM17N.tif', [215900.0, 1130240.0, 216000.0, 1130320.0]],
];
for (const [f, gdal] of cases) {
  const img = await (await fromFile(f)).getImage();
  const bb = img.getBoundingBox();
  bb.forEach((v, i) => assert.ok(Math.abs(v - gdal[i]) < 1e-6, `${f}: ${bb} vs GDAL ${gdal}`));
  console.log('  ok', f.split('/').pop(), 'coincide con GDAL:', bb.join(', '));
}
console.log('\nGeoTIFF: pruebas superadas');
