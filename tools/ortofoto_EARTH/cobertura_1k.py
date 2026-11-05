"""¿Qué parte de la Universidad EARTH cubre la Ortofoto 1:1000 (2015-2018, ~0,12 m) del IGN?
Pide, con calma, las teselas del zoom 17 que tocan el límite y mide qué fracción de cada una
tiene imagen (píxeles no transparentes). Resultado: cobertura_1k_z17.json
"""
import io
import json
import math
import os
import time

import requests
from PIL import Image
from shapely.geometry import Polygon, box

AQUI = os.path.dirname(os.path.abspath(__file__))
URL = ('https://geos1.snitcr.go.cr/Ortofoto1k/wmts2?service=WMTS&REQUEST=GetTile&VERSION=1.0.0'
       '&LAYER=ortofoto2017_1000&STYLE=&TILEMATRIXSET=EPSG:3857&TILEMATRIX=EPSG:3857:{z}'
       '&TILEROW={y}&TILECOL={x}&FORMAT=image/png')
gj = json.load(open(os.path.join(AQUI, 'limite_Universidad_EARTH_OSM.geojson'), encoding='utf-8'))
poly = Polygon(gj['features'][0]['geometry']['coordinates'][0])
z = 17
n = 2 ** z


def tile_box(x, y):
    lon0 = x / n * 360 - 180
    lon1 = (x + 1) / n * 360 - 180
    lat0 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    lat1 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return box(lon0, lat0, lon1, lat1)


minx, miny, maxx, maxy = poly.bounds
tx = lambda lon: int((lon + 180) / 360 * n)
ty = lambda lat: int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
tiles = [(x, y) for x in range(tx(minx), tx(maxx) + 1) for y in range(ty(maxy), ty(miny) + 1) if tile_box(x, y).intersects(poly)]
ses = requests.Session()
ses.headers['User-Agent'] = 'MapaDeCampo/1.3 (estudiante Universidad EARTH; revision de cobertura)'
out = []
for i, (x, y) in enumerate(tiles):
    r = ses.get(URL.format(z=z, x=x, y=y), timeout=40)
    frac = 0.0
    if r.status_code == 200 and r.headers.get('Content-Type', '').startswith('image/'):
        im = Image.open(io.BytesIO(r.content)).convert('RGBA')
        a = im.getchannel('A')
        frac = sum(1 for v in a.getdata() if v > 0) / (im.width * im.height)
    out.append([x, y, round(frac, 3)])
    time.sleep(0.3)
json.dump({'z': z, 'tiles': out}, open(os.path.join(AQUI, 'cobertura_1k_z17.json'), 'w'))
cov = [t for t in out if t[2] > 0.02]
print(f'z{z}: {len(out)} teselas en el límite, {len(cov)} con imagen 1:1000')
