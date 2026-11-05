"""Descarga, con calma, las teselas de la Ortofoto 1:5000 (2014-2017) del IGN/SNIT que
tocan el límite de la Universidad EARTH (zoom 18, EPSG:3857).

Fuente: Registro Nacional - Instituto Geográfico Nacional (IGN), Costa Rica, vía SNIT.
Licencia (metadatos ISO del IGN): «Su uso tendrá carácter libre y gratuito, siempre que
se mencione el origen y propiedad de los datos».

Una petición a la vez, con pausa entre peticiones, y se puede reanudar (salta las
teselas ya descargadas). Uso: python descargar_teselas.py
"""
import json
import os
import sys
import time

import requests

AQUI = os.path.dirname(os.path.abspath(__file__))
URL = ('https://geos1.snitcr.go.cr/Ortofoto2017/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0'
       '&LAYER=ortofoto2017_5000_altaresolucion&STYLE=&TILEMATRIXSET=EPSG:3857'
       '&TILEMATRIX=EPSG:3857:{z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png')
PAUSA = 0.3  # segundos entre peticiones

lista = json.load(open(os.path.join(AQUI, 'tiles_z18.json')))
z = lista['z']
carpeta = os.path.join(AQUI, 'teselas', str(z))
os.makedirs(carpeta, exist_ok=True)
ses = requests.Session()
ses.headers['User-Agent'] = 'MapaDeCampo/1.2 (estudiante Universidad EARTH; descarga unica del limite EARTH)'

hechas = fallos = vacias = 0
t0 = time.time()
for i, (x, y) in enumerate(lista['tiles']):
    destino = os.path.join(carpeta, f'{x}_{y}.png')
    if os.path.exists(destino) and os.path.getsize(destino) > 0:
        hechas += 1
        continue
    for intento in range(4):
        try:
            r = ses.get(URL.format(z=z, x=x, y=y), timeout=40)
            if r.status_code == 200 and r.headers.get('Content-Type', '').startswith('image/'):
                with open(destino + '.part', 'wb') as f:
                    f.write(r.content)
                os.replace(destino + '.part', destino)
                hechas += 1
                if len(r.content) < 2500:
                    vacias += 1
                break
            print(f'  {x},{y}: HTTP {r.status_code} {r.headers.get("Content-Type")}', flush=True)
        except requests.RequestException as e:
            print(f'  {x},{y}: {e}', flush=True)
        time.sleep(2 + 3 * intento)
    else:
        fallos += 1
    time.sleep(PAUSA)
    if (i + 1) % 100 == 0:
        print(f'{i + 1}/{len(lista["tiles"])} · {hechas} listas · {fallos} fallidas · {time.time() - t0:.0f} s', flush=True)

print(f'FIN: {hechas}/{len(lista["tiles"])} listas, {vacias} casi vacías, {fallos} fallidas, {time.time() - t0:.0f} s', flush=True)
sys.exit(1 if fallos else 0)
