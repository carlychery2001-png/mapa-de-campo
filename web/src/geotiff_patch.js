// Corrección de la esquina de origen de un GeoTIFF (OGC GeoTIFF 1.1, anexo B.2.2).
//
// geotiff.js 3.x devuelve como origen las coordenadas del punto de enlace
// (ModelTiepoint) sin tener en cuenta:
//   1) los índices de píxel (I, J) del punto de enlace, que no siempre son 0;
//   2) GTRasterTypeGeoKey = PixelIsPoint, donde el punto de enlace es el CENTRO
//      del píxel y la esquina está medio píxel arriba a la izquierda (es lo que
//      hace GDAL por defecto, GTIFF_POINT_GEO_IGNORE = NO).
// OpenLayers toma el origen de image.getOrigin(), así que se corrige aquí, en
// la única copia de geotiff.js incluida en la app.

import {GeoTIFFImage} from 'geotiff';

/**
 * Esquina superior izquierda del píxel (0,0).
 * @param {number[]|null} tiepoint ModelTiepoint (I,J,K,X,Y,Z)
 * @param {number[]|null} scale ModelPixelScale (Sx,Sy,Sz)
 * @param {number[]|null} transform ModelTransformation (matriz 4×4 por filas)
 * @param {boolean} pixelIsPoint
 */
export function cornerOrigin(tiepoint, scale, transform, pixelIsPoint) {
  const h = pixelIsPoint ? 0.5 : 0;
  if (tiepoint && tiepoint.length === 6 && scale) {
    const [I, J, , X, Y, Z] = tiepoint;
    return [X - (I + h) * scale[0], Y + (J + h) * scale[1], Z];
  }
  if (transform) {
    const [a, b, , d, e, f, , g] = transform;
    return [d - h * (a + b), g - h * (e + f), transform[11]];
  }
  return null;
}

const proto = GeoTIFFImage.prototype;
if (!proto.__mcOriginPatched) {
  const original = proto.getOrigin;
  proto.getOrigin = function () {
    const fd = this.fileDirectory;
    let tp = null, ps = null, mt = null, point = false;
    try {
      tp = fd.getValue('ModelTiepoint');
      ps = fd.getValue('ModelPixelScale');
      mt = fd.getValue('ModelTransformation');
      point = this.getGeoKeys()?.GTRasterTypeGeoKey === 2;
    } catch {
      return original.call(this);
    }
    const o = cornerOrigin(tp, ps, mt, point);
    return o || original.call(this);
  };
  proto.__mcOriginPatched = true;
}
