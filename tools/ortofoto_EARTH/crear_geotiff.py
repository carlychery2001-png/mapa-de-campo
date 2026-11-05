"""Une las teselas descargadas en un GeoTIFF optimizado (COG) recortado al límite de la
Universidad EARTH, listo para la app Mapa de Campo y para QGIS.

- Rejilla exacta de las teselas del zoom 18 (EPSG:3857, 0,597 m por píxel).
- Fuera del límite (OpenStreetMap, vía 321376631) queda transparente: máscara interna de GDAL.
- Compresión JPEG (calidad 85) en YCbCr, bloques de 512 px y pirámides: liviano y rápido.

Fuente: Ortofoto 1:5000 2014-2017 © Registro Nacional – Instituto Geográfico Nacional (IGN),
Costa Rica, vía SNIT. «Su uso tendrá carácter libre y gratuito, siempre que se mencione el
origen y propiedad de los datos.»
"""
import json
import math
import os

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.features import geometry_mask
from rasterio.shutil import copy as rio_copy
from rasterio.transform import Affine
from rasterio.windows import Window, transform as win_transform
from shapely.geometry import Polygon, mapping
from shapely.ops import transform as shp_transform

import argparse

AQUI = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--tiles', default='tiles_z18.json')
ap.add_argument('--carpeta', default='teselas')
ap.add_argument('--poligono', default='limite_Universidad_EARTH_OSM.geojson')
ap.add_argument('--salida', default='ortofoto_EARTH_IGN_2015_05m.tif')
ap.add_argument('--escala', default='1:5000 2014-2017')
ap.add_argument('--descripcion', default='Ortofoto IGN 0,5 m (2015) - Universidad EARTH, Guacimo, Limon, Costa Rica')
ap.add_argument('--recorte', default='Recorte: limite Universidad EARTH (c) OpenStreetMap contributors, ODbL.')
args = ap.parse_args()
SALIDA = os.path.join(AQUI, args.salida)
TMP = os.path.join(AQUI, '_mosaico_tmp.tif')
CREDITO = (f'Ortofoto {args.escala} (c) Registro Nacional - Instituto Geografico Nacional (IGN), Costa Rica, '
           'via SNIT. Uso libre y gratuito citando el origen y propiedad de los datos. ' + args.recorte)

lista = json.load(open(os.path.join(AQUI, args.tiles)))
z = lista['z']
tiles = [tuple(t) for t in lista['tiles']]
xs = [t[0] for t in tiles]
ys = [t[1] for t in tiles]
x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
TS = 256
W, H = (x1 - x0 + 1) * TS, (y1 - y0 + 1) * TS
R = 2 * math.pi * 6378137.0
res = R / (2 ** z) / TS
origin_x = -R / 2 + x0 * TS * res
origin_y = R / 2 - y0 * TS * res
transform = Affine(res, 0, origin_x, 0, -res, origin_y)
print(f'{W} x {H} px, {res:.4f} m/px (EPSG:3857), {len(tiles)} teselas')

gj = json.load(open(os.path.join(AQUI, args.poligono), encoding='utf-8'))
poly_ll = Polygon(gj['features'][0]['geometry']['coordinates'][0])
to3857 = Transformer.from_crs(4326, 3857, always_xy=True).transform
poly = shp_transform(to3857, poly_ll)
geoms = [mapping(poly)]

perfil = dict(driver='GTiff', width=W, height=H, count=4, dtype='uint8', crs='EPSG:3857', transform=transform,
              tiled=True, blockxsize=256, blockysize=256, compress='deflate', photometric='RGB', BIGTIFF='IF_SAFER')
faltan = vacias = 0
with rasterio.open(TMP, 'w', **perfil) as dst:
    dst.colorinterp = [rasterio.enums.ColorInterp.red, rasterio.enums.ColorInterp.green,
                       rasterio.enums.ColorInterp.blue, rasterio.enums.ColorInterp.alpha]
    dst.update_tags(TIFFTAG_COPYRIGHT=CREDITO, TIFFTAG_IMAGEDESCRIPTION=args.descripcion)
    for (x, y) in tiles:
        ruta = os.path.join(AQUI, args.carpeta, str(z), f'{x}_{y}.png')
        if not os.path.exists(ruta):
            faltan += 1
            continue
        im = np.array(Image.open(ruta).convert('RGBA'))
        if im.shape[0] != TS or im.shape[1] != TS:
            im = np.array(Image.open(ruta).convert('RGBA').resize((TS, TS)))
        win = Window((x - x0) * TS, (y - y0) * TS, TS, TS)
        dentro = geometry_mask(geoms, out_shape=(TS, TS), transform=win_transform(win, transform), invert=True)
        alfa = np.where(dentro, im[:, :, 3], 0).astype('uint8')
        if not alfa.any():
            vacias += 1
        rgb = np.where(alfa[:, :, None] > 0, im[:, :, :3], 0).astype('uint8')
        dst.write(np.dstack([rgb, alfa]).transpose(2, 0, 1), window=win)
print(f'mosaico listo · faltan {faltan} teselas · {vacias} sin datos dentro del límite')

if os.path.exists(SALIDA):
    os.remove(SALIDA)
# COG: con JPEG, GDAL convierte la banda alfa en una máscara interna (también en las pirámides)
rio_copy(TMP, SALIDA, driver='COG', COMPRESS='JPEG', QUALITY=85, BLOCKSIZE=512,
         OVERVIEW_RESAMPLING='AVERAGE', RESAMPLING='AVERAGE', BIGTIFF='IF_SAFER')
os.remove(TMP)
with rasterio.open(SALIDA) as ds:
    print('bandas', ds.count, ds.dtypes, '· máscara', ds.mask_flag_enums[0], '· pirámides', ds.overviews(1))
    print('perfil', {k: ds.profile.get(k) for k in ('compress', 'photometric', 'blockxsize', 'crs')}, ds.tags().get('TIFFTAG_COPYRIGHT', '')[:40])
print('archivo', SALIDA, round(os.path.getsize(SALIDA) / 2 ** 20, 1), 'MB')
