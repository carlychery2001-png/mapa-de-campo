"""Convierte un GeoTIFF en un COG (Cloud Optimized GeoTIFF) apto para el teléfono.

Un COG guarda la imagen en teselas internas de 512 px y trae pirámides
(overviews), así Mapa de Campo lee solo la parte visible a cada escala en vez
de cargar el archivo entero en memoria.

Uso (con el entorno .venv del proyecto, que ya trae rasterio/GDAL):
    python preparar_cog.py ortofoto.tif                 # → ortofoto_cog.tif
    python preparar_cog.py mde.tif --mde                # MDE: compresión sin pérdida
    python preparar_cog.py mapa.tif --epsg 8908         # asigna SRC si falta (no reproyecta)
    python preparar_cog.py ortofoto.tif --reproyectar 8908   # reproyecta a CRTM05 CR-SIRGAS

Opciones:
    --mde            Datos continuos (elevación): DEFLATE + predictor, remuestreo bilineal.
    --epsg N         Escribe el código EPSG si el archivo no lo trae (solo metadatos).
    --reproyectar N  Reproyecta los píxeles al EPSG indicado.
    --calidad Q      Calidad JPEG para ortofotos RGB (por defecto 85).
"""
import argparse
import os
import sys

import rasterio
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.shutil import copy as rio_copy
from rasterio.vrt import WarpedVRT


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("entrada")
    ap.add_argument("salida", nargs="?")
    ap.add_argument("--mde", action="store_true")
    ap.add_argument("--epsg", type=int)
    ap.add_argument("--reproyectar", type=int)
    ap.add_argument("--calidad", type=int, default=85)
    a = ap.parse_args()
    salida = a.salida or os.path.splitext(a.entrada)[0] + "_cog.tif"

    with rasterio.open(a.entrada) as src:
        crs = src.crs
        if a.epsg:
            crs = CRS.from_epsg(a.epsg)
        if crs is None:
            sys.exit("El archivo no tiene SRC. Indique uno con --epsg (p. ej. --epsg 8908 para CRTM05 CR-SIRGAS).")
        rgb = src.count >= 3 and all(dt == "uint8" for dt in src.dtypes[:3]) and not a.mde
        opts = dict(driver="COG", blocksize=512, overview_resampling="average" if rgb else "bilinear", BIGTIFF="IF_SAFER")
        if rgb:
            # JPEG con YCbCr es lo más compacto para fotos; se conservan solo 3 bandas (+máscara)
            opts.update(compress="JPEG", quality=a.calidad)
        else:
            opts.update(compress="DEFLATE", predictor=3 if src.dtypes[0].startswith("float") else 2)
        dataset = src
        if a.reproyectar:
            dataset = WarpedVRT(src, crs=CRS.from_epsg(a.reproyectar), src_crs=crs,
                                resampling=Resampling.bilinear if not rgb else Resampling.cubic)
        elif a.epsg:
            dataset = WarpedVRT(src, crs=crs, src_crs=crs)
        rio_copy(dataset, salida, **opts)

    with rasterio.open(salida) as out:
        mb = os.path.getsize(salida) / 1e6
        print(f"Listo: {salida}")
        print(f"  {out.width} x {out.height} px, {out.count} banda(s), SRC {out.crs.to_string()}")
        print(f"  pirámides: {out.overviews(1)}  ·  {mb:.1f} MB")
        print("Cópielo al teléfono y ábralo con Mapa de Campo (Menú > Importar).")


if __name__ == "__main__":
    main()
